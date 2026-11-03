import "server-only";
import type { AssignmentFrequency, PayComponent, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { COMPONENT_LIBRARY, CONTRIBUTION_LIBRARY, libraryDefaults, SYSTEM_CODES } from "@/lib/payroll/library";
import { scheduleFor } from "@/lib/payroll/schedule";
import { statutoryGaps, type ContributionType } from "@/lib/payroll/contributions";
import { periodBounds } from "@/lib/payroll/service";
import { UserError } from "./errors";

/** Line codes the engine calculates itself; they can never be entered by hand. */
export const STATUTORY_CODES = new Set(["LB", "LB-BB", "LB-OT", "AOV", "AOV-ER", "PENS", "PENS-ER", "BONUS", "OT1", "OT2", "UNPAID"]);
/** Library codes of the statutory deductions, shown as "automatic" in the deduction dropdowns. */
export const STATUTORY_DEDUCTIONS = ["DED001", "DED011", "DED002"] as const;
/** Fixed pension amount: only allowed when the contract has no pension percentage (otherwise it would be deducted twice). */
export const FIXED_PENSION_CODE = "DED013";

export type ComponentOption = {
  value: string; // component id, or "lib:CODE" for a library entry not yet used by the company
  code: string;
  name: string;
  kind: "ALLOWANCE" | "DEDUCTION" | "EMPLOYER";
  category: string | null;
  calcType: string;
  taxTreatment: string;
  frequency: AssignmentFrequency;
  defaultAmount: number;
  defaultRatePct: string;
  currency: string | null;
  aovIncluded: boolean;
  pensionIncluded: boolean;
  legalStatus: string;
  legalReference: string | null;
  fromLibrary: boolean;
};

/** Components replaced by contribution schemes (employee/employer share of health insurance, pension and FVO). */
const CONTRIBUTION_CODES = new Set(Object.values(CONTRIBUTION_LIBRARY).flat());
export const isContributionComponent = (c: { code: string; libraryCode?: string | null }) => CONTRIBUTION_CODES.has(c.libraryCode ?? "") || CONTRIBUTION_CODES.has(c.code);

export function isStatutory(c: Pick<PayComponent, "code" | "libraryCode">) {
  return STATUTORY_CODES.has(c.code) || SYSTEM_CODES.has(c.code) || (!!c.libraryCode && SYSTEM_CODES.has(c.libraryCode));
}

export const assignmentFrequencyOf = (f: string): AssignmentFrequency => (f === "ONE_OFF" ? "ONE_OFF" : f === "ANNUAL" ? "ANNUAL" : "MONTHLY");

const localName = (c: { name: string; nameNl?: string | null; nameEn?: string | null }, locale: string) => (locale === "en" ? c.nameEn : c.nameNl) || c.name;

/**
 * Components offered in the employee and payslip dropdowns: the company's active, approved components
 * marked "available to all employees", plus central-library entries the company has not used yet
 * (adopted automatically when selected). Statutory components are never offered.
 */
export async function componentOptions(companyId: string, locale: string): Promise<ComponentOption[]> {
  const comps = await db.payComponent.findMany({ where: { companyId }, orderBy: [{ kind: "asc" }, { name: "asc" }] });
  const used = new Set(comps.flatMap((c) => [c.code, c.libraryCode ?? ""]));
  const out: ComponentOption[] = comps
    .filter((c) => c.isActive && c.approvalStatus === "APPROVED" && c.availableToAll && !isStatutory(c) && !isContributionComponent(c) && c.category !== "LEAVE" && c.category !== "SALARY")
    .map((c) => ({
      value: c.id, code: c.code, name: localName(c, locale), kind: c.kind, category: c.category, calcType: c.calcType, taxTreatment: c.taxTreatment,
      frequency: assignmentFrequencyOf(c.frequency), defaultAmount: c.defaultAmount, defaultRatePct: c.defaultRateBp ? String(c.defaultRateBp / 100) : "",
      currency: c.currency, aovIncluded: c.aovIncluded, pensionIncluded: c.pensionIncluded, legalStatus: c.legalStatus, legalReference: c.legalReference, fromLibrary: false,
    }));
  for (const e of COMPONENT_LIBRARY) {
    if (e.isSystem || used.has(e.code) || CONTRIBUTION_CODES.has(e.code) || e.category === "LEAVE" || e.category === "SALARY") continue;
    const d = libraryDefaults(e);
    out.push({
      value: `lib:${e.code}`, code: e.code, name: locale === "en" ? e.nameEn : e.nameNl, kind: e.kind, category: e.category, calcType: d.calcType, taxTreatment: d.taxTreatment,
      frequency: assignmentFrequencyOf(d.frequency), defaultAmount: 0, defaultRatePct: "", currency: null, aovIncluded: d.aovIncluded, pensionIncluded: d.pensionIncluded,
      legalStatus: d.legalStatus, legalReference: e.legalReference ?? null, fromLibrary: true,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, locale));
}

/** Resolves a dropdown value to a company component, adopting a library entry on first use. */
export async function resolveComponent(companyId: string, value: string, locale: string, tx: Prisma.TransactionClient = db): Promise<PayComponent> {
  if (value.startsWith("lib:")) {
    const code = value.slice(4);
    const e = COMPONENT_LIBRARY.find((x) => x.code === code);
    if (!e || e.isSystem) throw new UserError("errors.statutoryAutomatic");
    if (CONTRIBUTION_CODES.has(e.code)) throw new UserError("errors.useContributionScheme");
    const existing = await tx.payComponent.findFirst({ where: { companyId, OR: [{ code }, { libraryCode: code }] } });
    if (existing) return existing;
    return tx.payComponent.create({
      data: {
        companyId, code: e.code, libraryCode: e.code, name: locale === "en" ? e.nameEn : e.nameNl, nameNl: e.nameNl, nameEn: e.nameEn,
        kind: e.kind, category: e.category, legalReference: e.legalReference ?? null, ...libraryDefaults(e),
      },
    });
  }
  const c = await tx.payComponent.findFirst({ where: { id: value, companyId } });
  if (!c) throw new UserError("errors.invalidEmployeeOrComponent");
  if (isStatutory(c)) throw new UserError("errors.statutoryAutomatic");
  if (isContributionComponent(c)) throw new UserError("errors.useContributionScheme");
  if (!c.isActive || c.approvalStatus !== "APPROVED") throw new UserError("errors.componentInactive", { name: c.name });
  return c;
}

const monthIndex = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth();

/** Months covered by an assignment, for overlap checks (one-off = only its payment month). */
function coverage(a: { frequency: AssignmentFrequency; startDate: Date; endDate: Date | null }): [number, number] {
  const from = monthIndex(a.startDate);
  if (a.frequency === "ONE_OFF") return [from, from];
  return [from, a.endDate ? monthIndex(a.endDate) : Number.MAX_SAFE_INTEGER];
}

/** The same component (with the same payslip label) may not be assigned twice for overlapping periods. */
export async function assertNoFixedDuplicate(a: { id?: string; employeeId: string; componentId: string; label: string | null; frequency: AssignmentFrequency; startDate: Date; endDate: Date | null }) {
  const others = await db.employeePayComponent.findMany({ where: { employeeId: a.employeeId, componentId: a.componentId, isActive: true, NOT: a.id ? { id: a.id } : undefined }, include: { component: true } });
  const [from, to] = coverage(a);
  for (const o of others) {
    if ((o.label ?? "").toLowerCase() !== (a.label ?? "").toLowerCase()) continue;
    const [oFrom, oTo] = coverage(o);
    if (from <= oTo && oFrom <= to) throw new UserError("errors.duplicateFixed", { name: o.label || o.component.name });
  }
}

/** Fixed pension amounts are rejected when the contract already deducts a pension percentage. */
export async function assertPensionNotDouble(employeeId: string, component: Pick<PayComponent, "code" | "libraryCode">) {
  if (component.code !== FIXED_PENSION_CODE && component.libraryCode !== FIXED_PENSION_CODE) return;
  const contract = await db.contract.findFirst({ where: { employeeId }, orderBy: { startDate: "desc" } });
  if (contract && contract.pensionEmployeeBp > 0) throw new UserError("errors.pensionViaContract");
}

/**
 * Incidental components on a payslip: not twice the same component/label, and not on top of a fixed
 * component that already applies in this period unless the user explicitly confirmed it as additional.
 */
export async function assertNoIncidentalDuplicate(run: { id: string; year: number; month: number }, employeeId: string, component: PayComponent, label: string | null, allowDuplicate: boolean) {
  const same = await db.payrollAdjustment.findFirst({ where: { runId: run.id, employeeId, componentId: component.id, assignmentId: null, description: label } });
  if (same) throw new UserError("errors.duplicateIncidental", { name: label || component.name });
  if (allowDuplicate) return;
  const { start, end } = periodBounds(run.year, run.month);
  const fixed = await db.employeePayComponent.findMany({ where: { employeeId, componentId: component.id, isActive: true, startDate: { lte: end }, OR: [{ endDate: null }, { endDate: { gte: start } }] } });
  if (fixed.some((f) => scheduleFor(f, run.year, run.month) !== "skip")) throw new UserError("errors.duplicateOfFixed", { name: component.name });
}

/** Raw (string) form fields shared by the fixed-component and payslip-component forms. */
export type OverrideFields = {
  calcType?: string; amount?: string; currency?: string; rate?: string; baseComponentCode?: string; quantity?: string;
  tax?: string; aovIncluded?: string; pensionIncluded?: string;
};

type CalcType = PayComponent["calcType"];
const CALC_TYPES = new Set(["FIXED", "PERCENT_OF_BASE", "PERCENT_OF_COMPONENT", "MANUAL"]);
const QTY_BASED = new Set(["HOURS_X_RATE", "DAYS_X_RATE", "QTY_X_PRICE"]);

/**
 * Validates and converts the per-employee / per-payslip settings. Returns field errors (translation keys)
 * keyed by form field, or the values to store. null means "use the component configuration".
 */
export async function parseOverrides(
  companyId: string,
  component: PayComponent,
  raw: OverrideFields,
  opts: { incidental: boolean; parseMoney: (v?: string) => number; defaultCurrency: string },
) {
  const errors: Record<string, string> = {};
  const choice = raw.calcType && raw.calcType !== "COMPONENT" ? raw.calcType : null;
  if (choice && (!CALC_TYPES.has(choice) || (opts.incidental && choice === "MANUAL"))) errors.calcType = "validation.invalid";
  const calcType = (choice ?? component.calcType) as CalcType;

  let amount = 0;
  try { amount = opts.parseMoney(raw.amount); if (amount < 0) throw new Error(); } catch { errors.amount = "validation.amount"; }
  let rateBp = 0;
  const pct = raw.rate ? Number(raw.rate.replace(",", ".")) : 0;
  if (!Number.isFinite(pct) || pct < 0 || pct > 1000) errors.rate = "validation.percent"; else rateBp = Math.round(pct * 100);
  const quantity = raw.quantity ? Number(raw.quantity.replace(",", ".")) : null;
  if (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10000)) errors.quantity = "validation.invalid";
  if (raw.currency && !/^[A-Z]{3}$/.test(raw.currency)) errors.currency = "validation.currency";

  if (calcType === "FIXED" && !errors.amount && amount <= 0 && (opts.incidental || component.defaultAmount <= 0)) errors.amount = "validation.amountRequired";
  if (calcType === "MANUAL" && opts.incidental && !errors.amount && amount <= 0) errors.amount = "validation.amountRequired";
  if ((calcType === "PERCENT_OF_BASE" || calcType === "PERCENT_OF_COMPONENT") && !errors.rate && rateBp <= 0 && component.defaultRateBp <= 0) errors.rate = "validation.percentRequired";
  let baseComponentCode: string | null = null;
  if (calcType === "PERCENT_OF_COMPONENT") {
    baseComponentCode = (raw.baseComponentCode ?? component.baseComponentCode ?? "").toUpperCase() || null;
    if (!baseComponentCode) errors.baseComponentCode = "validation.required";
    else if (baseComponentCode === component.code) errors.baseComponentCode = "validation.selfReference";
    else if (!(await db.payComponent.findFirst({ where: { companyId, code: baseComponentCode } }))) errors.baseComponentCode = "validation.unknownComponent";
  }
  if (QTY_BASED.has(calcType) && !quantity) errors.quantity = "validation.required";

  // Tax treatment: never silently exempt. Only allowances have a tax choice; bonuses/overtime keep their special regime or are taxable.
  let taxOverride: PayComponent["taxTreatment"] | null = null;
  if (component.kind === "ALLOWANCE" && (raw.tax === "TAXABLE" || raw.tax === "EXEMPT")) {
    if (raw.tax === "EXEMPT" && (component.category === "BONUS" || component.category === "OVERTIME")) errors.tax = "validation.treatmentNotAllowed";
    taxOverride = raw.tax;
  }
  const flag = (v?: string) => (component.kind === "ALLOWANCE" ? v === "on" || v === "true" : null);
  const fixedLike = calcType === "FIXED" || calcType === "MANUAL";
  return {
    errors,
    values: {
      calcType: choice ? calcType : null,
      amount: fixedLike ? amount : 0,
      currency: fixedLike ? raw.currency ?? opts.defaultCurrency : null,
      rateBp: calcType === "PERCENT_OF_BASE" || calcType === "PERCENT_OF_COMPONENT" ? rateBp : 0,
      baseComponentCode,
      quantity: QTY_BASED.has(calcType) ? quantity : null,
      taxOverride,
      aovIncluded: flag(raw.aovIncluded),
      pensionIncluded: flag(raw.pensionIncluded),
    },
  };
}

/**
 * Recalculates open (calculated) payroll runs in which an employee has a payslip after their fixed
 * components changed. Approved/paid runs are never touched. A run that cannot be recalculated is put back to draft.
 */
export async function recalcOpenRuns(companyId: string, employeeId: string, calculate: (runId: string) => Promise<unknown>) {
  const runs = await db.payrollRun.findMany({ where: { companyId, status: "CALCULATED", payslips: { some: { employeeId } } }, select: { id: true } });
  let failed = 0;
  for (const r of runs) {
    try { await calculate(r.id); } catch { failed++; await db.payrollRun.update({ where: { id: r.id }, data: { status: "DRAFT" } }); }
  }
  return { recalculated: runs.length - failed, failed };
}

/**
 * Statutory contribution types that block finalising payroll for a period: a statutory scheme applies, but no
 * scheme of that type is active, approved and configured (and it was not marked as not applicable).
 */
export async function missingStatutoryContributions(companyId: string, year: number, month: number) {
  const { start, end } = periodBounds(year, month);
  const schemes = await db.contributionScheme.findMany({ where: { companyId } });
  const covered: ContributionType[] = (await pensionCoveredByContracts(companyId, year, month)) ? ["PENSION"] : [];
  return statutoryGaps(schemes, start, end, covered).map((type) => ({ type, schemes: schemes.filter((s) => s.type === type && s.basis === "STATUTORY" && !s.notApplicable).map((s) => s.name) }));
}

/**
 * The statutory pension obligation is also met when every employee in the period has a pension percentage in
 * the employment contract (the existing way to record pension); a pension scheme is then not required.
 */
export async function pensionCoveredByContracts(companyId: string, year: number, month: number) {
  const { start, end } = periodBounds(year, month);
  const employees = await db.employee.findMany({
    where: { companyId, hireDate: { lte: end }, OR: [{ terminationDate: null }, { terminationDate: { gte: start } }] },
    select: { contracts: { where: { startDate: { lte: end } }, orderBy: { startDate: "desc" }, take: 1, select: { pensionEmployeeBp: true, pensionEmployerBp: true } } },
  });
  const withContract = employees.filter((e) => e.contracts.length > 0);
  return withContract.length > 0 && withContract.every((e) => e.contracts[0].pensionEmployeeBp > 0 || e.contracts[0].pensionEmployerBp > 0);
}
