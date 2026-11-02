import "server-only";
import type { AovRuleSet, LeaveType, Prisma, TaxRegime, TaxRuleSet } from "@prisma/client";
import { db } from "@/lib/db";
import {
  ageOn, calculatePayslip, ComponentError, employedFraction,
  type AovRules, type Bracket, type ComponentInput, type LeaveInput, type TaxRules,
} from "./engine";
import { LEAVE_CATEGORY_COMPONENT } from "./library";
import { priorAccrual, scheduleFor } from "./schedule";
import { CONTRIBUTION_LIBRARY } from "./library";
import { effectiveShares, schemeApplies } from "./contributions";
import type { ContributionInput } from "./engine";
import { workingDaysBetween } from "@/lib/leave";
import { RateBook } from "@/lib/server/rates";
import type { Conversion } from "@/lib/currency";

export function toRules(r: TaxRuleSet): TaxRules {
  return {
    brackets: r.brackets as unknown as Bracket[],
    taxCreditMonthly: r.taxCreditMonthly,
    lumpSumRateBp: r.lumpSumRateBp,
    lumpSumCapAnnual: r.lumpSumCapAnnual,
    aovRateBp: r.aovRateBp,
    aovFranchiseMonthly: r.aovFranchiseMonthly,
    overtimeBrackets: r.overtimeBrackets as unknown as Bracket[],
    childAllowanceExempt: r.childAllowanceExempt,
    childAllowanceMaxChildren: r.childAllowanceMaxChildren,
    bonusExemptAnnual: r.bonusExemptAnnual,
    taxFreeAnnual: r.taxFreeAnnual,
    taxFreeMonthly: r.taxFreeMonthly,
    lumpSumMode: r.lumpSumMode,
    lumpSumMonthly: r.lumpSumMonthly,
    calcMethod: r.calcMethod,
  };
}

export function toAovRules(r: AovRuleSet): AovRules {
  return {
    rateBp: r.rateBp,
    base: r.base,
    franchiseMonthly: r.franchiseMonthly,
    minMonthly: r.minMonthly,
    maxMonthly: r.maxMonthly,
    employeeShareBp: r.employeeShareBp,
    exemptFromAge: r.exemptFromAge,
  };
}

const effectiveOn = (companyId: string, onDate: Date) => ({
  approvalStatus: "APPROVED" as const,
  effectiveFrom: { lte: onDate },
  AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gte: onDate } }] }, { OR: [{ companyId }, { companyId: null }] }],
});

/**
 * Most recent approved rule set of a tax regime effective on the given date.
 * Company-specific sets override platform defaults; among equal dates the newest version wins.
 */
export async function findRuleSet(companyId: string, onDate: Date, regime: TaxRegime = "STANDARD") {
  return db.taxRuleSet.findFirst({
    where: { ...effectiveOn(companyId, onDate), regime },
    orderBy: [{ effectiveFrom: "desc" }, { companyId: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
  });
}

export async function findAovRuleSet(companyId: string, onDate: Date) {
  return db.aovRuleSet.findFirst({
    where: effectiveOn(companyId, onDate),
    orderBy: [{ effectiveFrom: "desc" }, { companyId: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
  });
}

/** A rule is legally validated for a period only when verified and the period falls within its verified validity. */
export function isLegallyValid(rule: { verificationStatus: string; verifiedUntil: Date | null } | null | undefined, periodEnd: Date) {
  return !!rule && rule.verificationStatus === "VERIFIED" && (!rule.verifiedUntil || rule.verifiedUntil >= periodEnd);
}

export const periodBounds = (year: number, month: number) => ({
  start: new Date(Date.UTC(year, month - 1, 1)),
  end: new Date(Date.UTC(year, month, 0, 23, 59, 59)),
});

/** Employees eligible for a period: hired before period end and not terminated before period start. */
export function eligibleEmployeesWhere(companyId: string, year: number, month: number): Prisma.EmployeeWhereInput {
  const { start, end } = periodBounds(year, month);
  return {
    companyId,
    hireDate: { lte: end },
    OR: [{ terminationDate: null }, { terminationDate: { gte: start } }],
  };
}

/** Error carrying a translation key (and optional values) so it can be shown in the user's language. */
export class PayrollError extends Error {
  constructor(public key: string, public values?: Record<string, string | number>) {
    super(key);
  }
}

const PARENTAL = new Set(["PARENTAL", "MATERNITY", "PATERNITY", "ADOPTION"]);

/** Approved leave falling in the period, converted to engine inputs (only leave the policy does not fully pay, plus parental leave for traceability). */
export function leaveInputsForPeriod(
  requests: { startDate: Date; endDate: Date; days: number; approvedDays: number | null; schedulePercentBp: number; leaveType: Pick<LeaveType, "code" | "name" | "category" | "payPercentBp" | "componentCode"> }[],
  start: Date,
  end: Date,
): LeaveInput[] {
  const out: LeaveInput[] = [];
  for (const r of requests) {
    const informational = PARENTAL.has(r.leaveType.category);
    if (r.leaveType.payPercentBp >= 10000 && !informational) continue;
    const from = r.startDate > start ? r.startDate : start;
    const to = r.endDate < end ? r.endDate : end;
    if (to < from) continue;
    const total = workingDaysBetween(r.startDate, r.endDate);
    const inPeriod = workingDaysBetween(from, to);
    if (inPeriod <= 0 || total <= 0) continue;
    // Approved days may differ from the calendar span: scale proportionally; part-time leave scales by schedule.
    const approvedShare = r.approvedDays != null && r.days > 0 ? Math.min(1, r.approvedDays / total) : 1;
    const days = Math.round(inPeriod * approvedShare * (r.schedulePercentBp / 10000) * 100) / 100;
    if (days <= 0) continue;
    out.push({
      code: r.leaveType.componentCode ?? LEAVE_CATEGORY_COMPONENT[r.leaveType.category] ?? `LEAVE-${r.leaveType.code}`,
      label: r.leaveType.name,
      days,
      payPercentBp: r.leaveType.payPercentBp,
      informational,
    });
  }
  return out;
}

/**
 * (Re)calculates all payslips for a run. Only DRAFT and CALCULATED runs can be calculated.
 *
 * Currency handling: statutory amounts are calculated in the tax rule set's currency (SRD).
 * Salary, allowances, deductions and bonuses in other currencies are converted into that
 * currency first, using the approved exchange rate effective on the last day of the period.
 * Net pay is then converted into the employee's payment currency and all totals into the
 * company's base currency. Every conversion (amounts, rate, rate date, source) is stored on the payslip.
 *
 * Legal status: a payslip is VALIDATED only when the tax and AOV rule versions used are verified
 * for the period and no component with pending legal status contributed; otherwise the run is
 * PENDING_LEGAL_VALIDATION and cannot be approved without an explicit acknowledgement.
 */
export async function calculateRun(runId: string) {
  const run = await db.payrollRun.findUniqueOrThrow({ where: { id: runId }, include: { company: true } });
  if (run.status !== "DRAFT" && run.status !== "CALCULATED") throw new PayrollError("errors.runLocked");

  const { start, end } = periodBounds(run.year, run.month);
  const ruleSet = await findRuleSet(run.companyId, end);
  if (!ruleSet) throw new PayrollError("errors.noRuleSet");
  const aovRuleSet = await findAovRuleSet(run.companyId, end);
  const calcCur = ruleSet.currency;
  const baseCur = run.company.currency;

  const employees = await db.employee.findMany({
    where: eligibleEmployeesWhere(run.companyId, run.year, run.month),
    include: {
      department: true,
      contracts: { where: { startDate: { lte: end } }, orderBy: { startDate: "desc" }, take: 1 },
      components: {
        where: {
          isActive: true, startDate: { lte: end }, OR: [{ endDate: null }, { endDate: { gte: start } }],
          component: { isActive: true, approvalStatus: "APPROVED", AND: [{ OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: end } }] }, { OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }] }] },
        },
        include: { component: true },
        orderBy: { createdAt: "asc" },
      },
      leaveRequests: { where: { status: "APPROVED", startDate: { lte: end }, endDate: { gte: start } }, include: { leaveType: true } },
      contributions: true,
    },
  });
  const inputs = await db.payrollInput.findMany({ where: { runId } });
  const adjustments = await db.payrollAdjustment.findMany({ where: { runId }, include: { component: true }, orderBy: { createdAt: "asc" } });
  // Contribution schemes (health insurance, pension, FVO) active in the period.
  const schemes = await db.contributionScheme.findMany({
    where: { companyId: run.companyId, isActive: true, effectiveFrom: { lte: end }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }] },
    orderBy: { effectiveFrom: "asc" },
  });

  // Rule sets per tax regime (the Art. 17a regime is only used for employees explicitly linked to it).
  const regimeRules = new Map<TaxRegime, TaxRuleSet>([["STANDARD", ruleSet]]);
  for (const regime of new Set(employees.map((e) => e.taxRegime))) {
    if (regimeRules.has(regime)) continue;
    const rs = await findRuleSet(run.companyId, end, regime);
    if (!rs) throw new PayrollError("errors.noRegimeRuleSet", { regime });
    regimeRules.set(regime, rs);
  }

  // Exchange rates: collect every currency pair needed, then resolve them once.
  const currencies = await db.currency.findMany();
  const book = new RateBook(end, { companyId: run.companyId, allowApi: run.company.rateAllowApi }, new Map(currencies.map((c) => [c.code, c.decimals])));
  const pairs: [string, string][] = [[calcCur, baseCur]];
  for (const e of employees) {
    const sc = e.contracts[0]?.salaryCurrency;
    if (!sc) continue;
    pairs.push([sc, calcCur], [calcCur, e.paymentCurrency ?? sc]);
    for (const a of e.components) pairs.push([a.currency ?? sc, calcCur], [a.component.currency ?? sc, calcCur]);
    for (const a of adjustments.filter((x) => x.employeeId === e.id)) pairs.push([a.currency ?? sc, calcCur], [a.component.currency ?? sc, calcCur]);
    for (const sch of schemes) pairs.push([sch.currency, calcCur]);
  }
  await book.prepare(pairs);
  if (book.missing.size) throw new PayrollError("errors.missingRates", { pairs: [...book.missing].join(", ") });

  // Bonus exemption already used this year, from earlier runs' traces.
  const earlierSlips = await db.payslip.findMany({
    where: { run: { companyId: run.companyId, year: run.year, month: { lt: run.month } } },
    select: { employeeId: true, trace: true },
  });
  // Accrual balances (e.g. holiday allowance) carried forward from the previous 24 months.
  const accrualSlips = await db.payslip.findMany({
    where: { runId: { not: runId }, run: { companyId: run.companyId, OR: [{ year: { lt: run.year, gte: run.year - 2 } }, { year: run.year, month: { lt: run.month } }] } },
    select: { employeeId: true, trace: true, run: { select: { year: true, month: true } } },
  });
  const ytdBonusExempt = new Map<string, number>();
  for (const s of earlierSlips) {
    const used = Number((s.trace as Record<string, number>)?.bonusExemptUsed ?? 0);
    ytdBonusExempt.set(s.employeeId, (ytdBonusExempt.get(s.employeeId) ?? 0) + used);
  }

  const skipped: { name: string; reason: string }[] = [];
  const results: Prisma.PayslipCreateInput[] = [];
  const aovRules = aovRuleSet ? toAovRules(aovRuleSet) : undefined;
  const aovValid = aovRuleSet ? isLegallyValid(aovRuleSet, end) : isLegallyValid(ruleSet, end);
  let runValidated = true;

  for (const e of employees) {
    const contract = e.contracts[0];
    const name = `${e.firstName} ${e.lastName}`;
    if (!contract) {
      skipped.push({ name, reason: "noContract" });
      continue;
    }
    const fraction = employedFraction(run.year, run.month, e.hireDate, e.terminationDate);
    if (fraction <= 0) continue;
    const empRuleSet = regimeRules.get(e.taxRegime)!;
    const input = inputs.find((i) => i.employeeId === e.id);
    const salaryCur = contract.salaryCurrency;
    const payCur = e.paymentCurrency ?? salaryCur;
    const conv: Conversion[] = [];
    const toCalc = (amount: number, cur: string, purpose: string) => (amount ? book.convert(amount, cur, calcCur, purpose, conv) : 0);
    let componentsLegal = true;

    type Comp = (typeof e.components)[number]["component"];
    type Src = {
      amount: number; currency: string | null; rateBp: number; quantity: number | null;
      label?: string | null; calcType?: ComponentInput["calcType"] | null; baseComponentCode?: string | null;
      taxOverride?: ComponentInput["taxTreatment"] | null; aovIncluded?: boolean | null; pensionIncluded?: boolean | null;
      /** An explicit amount (per-payslip override): 0 means 0, never the component default. */
      explicit?: boolean;
    };
    // Per-employee / per-payslip settings override the component configuration; null = component setting.
    const toInput = (c: Comp, src: Src, source: "FIXED" | "INCIDENTAL"): ComponentInput => {
      if (c.legalStatus === "PENDING_VERIFICATION" || c.legalStatus === "CONFLICT") componentsLegal = false;
      const calcType = src.calcType ?? c.calcType;
      const label = src.label || c.name;
      const useDefault = !src.explicit && src.amount === 0 && (calcType === "FIXED" || calcType === "MANUAL");
      return {
        code: c.code,
        name: label,
        labels: src.label ? { nl: src.label, en: src.label } : { nl: c.nameNl ?? label, en: c.nameEn ?? label },
        kind: c.kind,
        calcType,
        taxTreatment: src.taxOverride ?? c.taxTreatment,
        exemptLimit: c.exemptLimit,
        preTax: c.preTax,
        amount: useDefault ? toCalc(c.defaultAmount, c.currency ?? salaryCur, label) : toCalc(src.amount, src.currency ?? salaryCur, label),
        rateBp: src.rateBp || c.defaultRateBp,
        quantity: src.quantity,
        multiplierBp: c.multiplierBp,
        unitPrice: toCalc(c.unitPrice, c.currency ?? salaryCur, `${label} (unit price)`),
        baseComponentCode: src.baseComponentCode ?? c.baseComponentCode,
        formula: c.formula,
        aovIncluded: src.aovIncluded ?? c.aovIncluded,
        pensionIncluded: src.pensionIncluded ?? c.pensionIncluded,
        netEffect: c.netEffect,
        source,
        libraryCode: c.libraryCode,
        category: c.category,
      };
    };
    const empAdjustments = adjustments.filter((a) => a.employeeId === e.id);
    const earlierOfEmployee = accrualSlips.filter((s) => s.employeeId === e.id).map((s) => ({ ...s.run, trace: s.trace }));
    const components: ComponentInput[] = [];
    // Fixed components: active, within their validity and due in this period according to their frequency.
    for (const a of e.components) {
      // Termination ends every fixed component, so accrued amounts (e.g. holiday allowance) are paid out on exit.
      const endDate = e.terminationDate && (!a.endDate || e.terminationDate < a.endDate) ? e.terminationDate : a.endDate;
      const decision = scheduleFor({ ...a, endDate }, run.year, run.month);
      if (decision === "skip") continue;
      // A per-payslip override replaces the fixed amount for this run only (never added on top).
      const override = empAdjustments.find((x) => x.assignmentId === a.id);
      const input = override
        ? toInput(a.component, { ...a, calcType: "FIXED", amount: override.amount, currency: override.currency, label: override.description || a.label, explicit: true }, "FIXED")
        : toInput(a.component, a, "FIXED");
      // An override in the payout period is the total amount paid (it replaces the accrued balance as well).
      if (decision === "accrue" || decision === "accrueAndPay") input.accrual = { id: a.id, prior: override && decision === "accrueAndPay" ? 0 : priorAccrual(earlierOfEmployee, a.id), pay: decision === "accrueAndPay" };
      components.push(input);
    }
    // Incidental components added to this payslip only.
    for (const a of empAdjustments) {
      if (a.assignmentId) continue;
      components.push(toInput(a.component, { ...a, label: a.description }, "INCIDENTAL"));
    }

    // Contribution schemes that apply to this employee: at most one per type, and never together with a
    // component that already deducts the same contribution (no double deduction).
    const contributions: ContributionInput[] = [];
    for (const sch of schemes) {
      const enrollment = e.contributions.find((c) => c.schemeId === sch.id);
      if (!schemeApplies(sch, enrollment, start, e.terminationDate && e.terminationDate < end ? e.terminationDate : end)) continue;
      if (contributions.some((c) => c.type === sch.type)) throw new PayrollError("errors.contributionMultiple", { employee: name, type: sch.type });
      const clash = components.find((c) => CONTRIBUTION_LIBRARY[sch.type].includes(c.libraryCode ?? c.code));
      if (clash) throw new PayrollError("errors.contributionDuplicate", { employee: name, scheme: sch.name, component: clash.name });
      if (sch.legalStatus === "PENDING_VERIFICATION" || sch.legalStatus === "CONFLICT") componentsLegal = false;
      const shares = effectiveShares(sch, enrollment);
      contributions.push({
        id: sch.id, type: sch.type, name: sch.name, labels: { nl: sch.name, en: sch.name }, method: sch.method, base: sch.base,
        employeeRateBp: shares.employeeRateBp, employerRateBp: shares.employerRateBp,
        employeeAmount: toCalc(shares.employeeAmount, sch.currency, `${sch.name} (werknemer)`),
        employerAmount: toCalc(shares.employerAmount, sch.currency, `${sch.name} (werkgever)`),
        maxBase: sch.maxBaseMonthly != null ? toCalc(sch.maxBaseMonthly, sch.currency, `${sch.name} (max.)`) : null,
        preTax: sch.employeeTax === "PRE_TAX", showEmployer: sch.showOnPayslip,
      });
    }

    let r;
    try {
      r = calculatePayslip(
        {
          payType: contract.payType,
          baseSalary: toCalc(contract.baseSalary, salaryCur, "BASE"),
          hourlyRate: toCalc(contract.hourlyRate, salaryCur, "HOURLY_RATE"),
          hoursPerWeek: contract.hoursPerWeek,
          pensionEmployeeBp: contract.pensionEmployeeBp,
          pensionEmployerBp: contract.pensionEmployerBp,
          numberOfChildren: e.numberOfChildren,
          employedFraction: fraction,
          age: ageOn(e.dateOfBirth, end),
        },
        {
          hoursWorked: input?.hoursWorked ?? null,
          daysWorked: input?.daysWorked ?? null,
          overtime1Hours: input?.overtime1Hours ?? 0,
          overtime2Hours: input?.overtime2Hours ?? 0,
          overtime1RateBp: run.company.overtimeRate1Bp,
          overtime2RateBp: run.company.overtimeRate2Bp,
          bonus: toCalc(input?.bonus ?? 0, salaryCur, "BONUS"),
          unpaidDays: input?.unpaidDays ?? 0,
          ytdBonusExemptUsed: ytdBonusExempt.get(e.id) ?? 0,
          leave: leaveInputsForPeriod(e.leaveRequests, start, end),
        },
        components,
        toRules(empRuleSet),
        aovRules,
        contributions,
      );
    } catch (err) {
      if (err instanceof ComponentError) throw new PayrollError("errors.componentCalc", { employee: name, code: err.code, error: err.message });
      throw err;
    }

    const legal = isLegallyValid(empRuleSet, end) && aovValid && componentsLegal;
    if (!legal) runValidated = false;
    const netPayPayment = book.convert(r.netPay, calcCur, payCur, "NET_PAY", conv);
    const toBase = (v: number, purpose?: string) => book.convert(v, calcCur, baseCur, purpose ?? "", purpose ? conv : undefined);
    const conversions = conv.filter((c) => c.originalAmount !== 0 && c.from !== c.to);

    results.push({
      run: { connect: { id: run.id } },
      employee: { connect: { id: e.id } },
      employeeName: name,
      employeeNumber: e.employeeNumber,
      jobTitle: e.jobTitle,
      department: e.department?.name ?? null,
      bankName: e.bankName,
      bankAccount: e.bankAccount,
      grossPay: r.grossPay,
      taxableWage: r.taxableWage,
      wageTax: r.totalTax,
      aov: r.aov,
      aovBaseAmount: r.aovBase,
      aovEmployer: r.aovEmployer,
      totalDeductions: r.totalDeductions,
      netPay: r.netPay,
      employerCost: r.employerCost,
      calcCurrency: calcCur,
      salaryCurrency: salaryCur,
      paymentCurrency: payCur,
      netPayPayment,
      baseCurrency: baseCur,
      grossBase: toBase(r.grossPay, "REPORTING"),
      wageTaxBase: toBase(r.totalTax),
      aovBase: toBase(r.aov),
      netBase: toBase(r.netPay),
      employerCostBase: toBase(r.employerCost),
      conversions: conversions as unknown as Prisma.InputJsonValue,
      taxRuleSetId: empRuleSet.id,
      aovRuleSetId: aovRuleSet?.id ?? null,
      legalStatus: legal ? "VALIDATED" : "PENDING_LEGAL_VALIDATION",
      trace: {
        ...r.trace, bonusExemptUsed: r.bonusExemptUsed, pensionEmployer: r.pensionEmployer,
        ruleSet: empRuleSet.name, ruleSetId: empRuleSet.id, regime: e.taxRegime,
        aovRuleSet: aovRuleSet?.name ?? `${empRuleSet.name} (AOV)`, aovRuleSetId: aovRuleSet?.id ?? null,
        calculatedAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
      lines: {
        create: r.lines.map((l, i) => ({
          sortOrder: i, type: l.type, source: l.source ?? null, group: l.group ?? null, showOnPayslip: l.showOnPayslip ?? true, code: l.code, description: l.description, quantity: l.quantity ?? null, rate: l.rate ?? null, amount: l.amount,
          labels: l.labels ? (l.labels as Prisma.InputJsonValue) : undefined,
          ...(["SAL001", "SAL002", "SAL008"].includes(l.code) && salaryCur !== calcCur
            ? { originalAmount: Math.round(contract.baseSalary * (contract.payType === "MONTHLY" ? fraction : 1)), originalCurrency: salaryCur }
            : {}),
        })),
      },
    });
  }

  const sum = (k: "grossBase" | "netBase" | "wageTaxBase" | "aovBase" | "employerCostBase") => results.reduce((s, r) => s + (r[k] as number), 0);

  await db.$transaction(async (tx) => {
    // Lock the run row and re-check its status: an approved/paid run is never overwritten, even under concurrency.
    const [locked] = await tx.$queryRaw<{ status: string }[]>`SELECT "status"::text AS status FROM "PayrollRun" WHERE "id" = ${runId} FOR UPDATE`;
    if (!locked || (locked.status !== "DRAFT" && locked.status !== "CALCULATED")) throw new PayrollError("errors.runLocked");
    await tx.payslip.deleteMany({ where: { runId } });
    for (const data of results) await tx.payslip.create({ data });
    await tx.payrollRun.update({
      where: { id: runId },
      data: {
        status: "CALCULATED",
        calculatedAt: new Date(),
        taxRuleSetId: ruleSet.id,
        aovRuleSetId: aovRuleSet?.id ?? null,
        legalStatus: runValidated && results.length > 0 ? "VALIDATED" : "PENDING_LEGAL_VALIDATION",
        currency: baseCur,
        employeeCount: results.length,
        totalGross: sum("grossBase"),
        totalNet: sum("netBase"),
        totalWageTax: sum("wageTaxBase"),
        totalAov: sum("aovBase"),
        totalEmployer: sum("employerCostBase"),
      },
    });
  }, { timeout: 60_000 });

  return { count: results.length, skipped, ruleSetVerified: runValidated };
}
