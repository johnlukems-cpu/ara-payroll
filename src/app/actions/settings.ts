"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getLocale, getTranslations } from "next-intl/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/server/auth";
import { setActiveCompany } from "@/lib/server/session";
import { audit } from "@/lib/server/audit";
import { seedCompanyDefaults } from "@/lib/server/company-setup";
import { assertActiveCurrency } from "@/lib/server/rates";
import { formObject, handleError, ok, UserError, type ActionState } from "@/lib/server/action";
import { validateBrackets, type Bracket } from "@/lib/payroll/engine";
import { parseMoney } from "@/lib/format";
import { currencyField, dateField, moneyField, numberField, optionalDate, optionalText, percentField } from "@/lib/validation";
import { SYSTEM_CODES, COMPONENT_LIBRARY, LEAVE_CATEGORY_COMPONENT, libraryDefaults } from "@/lib/payroll/library";
import { formulaVariables } from "@/lib/payroll/formula";
import { isLocale } from "@/i18n/config";

async function ensureCurrency(code: string) {
  if (!(await assertActiveCurrency(code))) throw new UserError("errors.currencyInactive", { code });
}

export async function updateCompanyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("company.manage");
    const data = z.object({
      name: z.string({ error: "validation.required" }).min(2).max(160),
      legalName: optionalText(200),
      kkfNumber: optionalText(40),
      taxNumber: optionalText(40),
      address: optionalText(200),
      district: optionalText(40),
      phone: optionalText(40),
      email: z.email("validation.email").optional().transform((v) => v ?? null),
      bankName: optionalText(80),
      bankAccount: optionalText(40),
      defaultHoursPerWeek: numberField(1, 80),
      overtimeRate1Bp: z.coerce.number().min(100).max(500).transform((v) => Math.round(v * 100)),
      overtimeRate2Bp: z.coerce.number().min(100).max(500).transform((v) => Math.round(v * 100)),
    }).parse(formObject(fd));
    await db.company.update({ where: { id: ctx.company.id }, data });
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "company.update", entity: "Company", entityId: ctx.company.id });
    revalidatePath("/app", "layout");
    return ok((await getTranslations())("settings.company.saved"));
  } catch (e) {
    return handleError(e);
  }
}

/**
 * Controlled base-currency change: requires company.manage, a typed confirmation and a reason,
 * and no open payroll runs. Historical runs keep their own currency and conversion records.
 */
export async function changeBaseCurrencyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("company.manage");
    const data = z.object({
      currency: currencyField,
      reason: z.string({ error: "validation.required" }).min(5).max(500),
      confirmName: z.string({ error: "validation.required" }),
    }).parse(formObject(fd));
    if (data.currency === ctx.company.currency) throw new UserError("errors.sameBase");
    if (data.confirmName.trim() !== ctx.company.name.trim()) throw new UserError("errors.nameMismatch");
    await ensureCurrency(data.currency);
    const open = await db.payrollRun.count({ where: { companyId: ctx.company.id, status: { in: ["DRAFT", "CALCULATED"] } } });
    if (open) throw new UserError("errors.openRuns");
    const from = ctx.company.currency;
    await db.company.update({ where: { id: ctx.company.id }, data: { currency: data.currency } });
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "company.base_currency_changed", entity: "Company", entityId: ctx.company.id, details: { from, to: data.currency, reason: data.reason } });
    revalidatePath("/app", "layout");
    return ok((await getTranslations())("settings.currency.changed", { from, to: data.currency }));
  } catch (e) {
    return handleError(e);
  }
}

export async function saveRatePolicyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("company.manage");
    const rateRequireApproval = fd.get("rateRequireApproval") === "on";
    const rateAllowApi = fd.get("rateAllowApi") === "on";
    await db.company.update({ where: { id: ctx.company.id }, data: { rateRequireApproval, rateAllowApi } });
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "company.rate_policy_changed", entity: "Company", entityId: ctx.company.id, details: { rateRequireApproval, rateAllowApi } });
    revalidatePath("/app", "layout");
    return ok((await getTranslations())("settings.currency.policySaved"));
  } catch (e) {
    return handleError(e);
  }
}

export async function createCompanyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("company.manage");
    const data = z.object({ name: z.string({ error: "validation.required" }).min(2).max(160), currency: currencyField }).parse(formObject(fd));
    await ensureCurrency(data.currency);
    const raw = await getLocale();
    const company = await db.$transaction(async (tx) => {
      const c = await tx.company.create({ data: { name: data.name, currency: data.currency, organizationId: ctx.company.organizationId } });
      await tx.membership.create({ data: { userId: ctx.user.id, companyId: c.id, role: "OWNER" } });
      await seedCompanyDefaults(tx, c.id, isLocale(raw) ? raw : "nl");
      return c;
    });
    await setActiveCompany(ctx.session.id, company.id);
    await audit({ companyId: company.id, userId: ctx.user.id, action: "company.create", entity: "Company", entityId: company.id, details: { currency: data.currency } });
    revalidatePath("/app", "layout");
    return ok((await getTranslations())("companies.created", { name: data.name }));
  } catch (e) {
    return handleError(e);
  }
}

const componentSchema = z.object({
  code: z.string({ error: "validation.required" }).min(1).max(12).regex(/^[A-Z0-9+\-_]+$/i, "validation.code").transform((s) => s.toUpperCase()),
  name: z.string({ error: "validation.required" }).min(2).max(100),
  kind: z.enum(["ALLOWANCE", "DEDUCTION"]),
  calcType: z.enum(["FIXED", "PERCENT_OF_BASE"]),
  taxTreatment: z.enum(["TAXABLE", "EXEMPT", "EXEMPT_UP_TO_LIMIT", "CHILD_ALLOWANCE"]).default("TAXABLE"),
  exemptLimit: moneyField,
  preTax: z.string().optional().transform((v) => v === "on"),
});

export async function saveComponentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("settings.manage");
    const raw = formObject(fd);
    const data = componentSchema.parse(raw);
    if (data.kind === "DEDUCTION") data.taxTreatment = "TAXABLE";
    if (data.kind === "ALLOWANCE") data.preTax = false;
    if (raw.id) {
      const existing = await db.payComponent.findFirst({ where: { id: raw.id, companyId: ctx.company.id } });
      if (!existing) throw new UserError("errors.notFound");
      await db.payComponent.update({ where: { id: existing.id }, data: { ...data, isActive: raw.isActive === "on" } });
    } else {
      await db.payComponent.create({ data: { ...data, companyId: ctx.company.id } });
    }
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: raw.id ? "component.update" : "component.create", entity: "PayComponent", details: { code: data.code } });
    revalidatePath("/app/settings/components");
    return ok((await getTranslations())("settings.components.saved"));
  } catch (e) {
    return handleError(e);
  }
}

export async function saveDepartmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("settings.manage");
    const { name } = z.object({ name: z.string({ error: "validation.required" }).min(2).max(80) }).parse(formObject(fd));
    await db.department.create({ data: { name, companyId: ctx.company.id } });
    revalidatePath("/app/settings/departments");
    return ok((await getTranslations())("settings.departments.added"));
  } catch (e) {
    return handleError(e);
  }
}

export async function deleteDepartmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("settings.manage");
    await db.department.deleteMany({ where: { id: String(fd.get("id")), companyId: ctx.company.id } });
    revalidatePath("/app/settings/departments");
    return ok((await getTranslations())("settings.departments.removed"));
  } catch (e) {
    return handleError(e);
  }
}

export async function saveLeaveTypeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("settings.manage");
    const raw = formObject(fd);
    const num = (max: number) => z.string().optional().transform((v) => Number((v ?? "0").replace(",", "."))).pipe(z.number().min(0).max(max));
    const data = z.object({
      code: z.string({ error: "validation.required" }).min(1).max(10).transform((s) => s.toUpperCase()),
      name: z.string({ error: "validation.required" }).min(2).max(80),
      category: z.enum(["ANNUAL", "SICK", "SPECIAL", "UNPAID", "PUBLIC_HOLIDAY", "PARENTAL", "MATERNITY", "PATERNITY", "ADOPTION", "UNAUTHORIZED"]).default("SPECIAL"),
      annualEntitlementDays: num(365),
      statutoryDays: z.string().optional().transform((v) => (v ? Number(v.replace(",", ".")) : null)).pipe(z.number().min(0).max(400).nullable()),
      companyExtraDays: num(400),
      payPercentBp: percentField,
      unit: z.enum(["DAYS", "HOURS"]).default("DAYS"),
      allowPartTime: z.string().optional().transform((v) => v === "on"),
      carryForward: z.string().optional().transform((v) => v === "on"),
      maxCarryForwardDays: num(365),
      legalStatus: z.enum(["PENDING_VERIFICATION", "PARTIALLY_VERIFIED", "CONFLICT", "COMPANY_POLICY", "VERIFIED"]).default("COMPANY_POLICY"),
      legalReference: optionalText(300),
    }).parse({ ...raw, payPercentBp: raw.payPercentBp ?? "100" });
    if (data.legalStatus === "VERIFIED" && ctx.role !== "OWNER" && ctx.role !== "ADMIN") throw new UserError("errors.forbidden");
    const derived = { isPaid: data.payPercentBp > 0, componentCode: LEAVE_CATEGORY_COMPONENT[data.category] };
    if (raw.id) {
      const lt = await db.leaveType.findFirst({ where: { id: raw.id, companyId: ctx.company.id } });
      if (!lt) throw new UserError("errors.notFound");
      await db.leaveType.update({ where: { id: lt.id }, data: { ...data, ...derived } });
    } else {
      await db.leaveType.create({ data: { ...data, ...derived, companyId: ctx.company.id } });
    }
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "leave_type.save", entity: "LeaveType", details: { code: data.code, category: data.category, payPercentBp: data.payPercentBp } });
    revalidatePath("/app/settings/leave");
    return ok((await getTranslations())("settings.leaveTypes.saved"));
  } catch (e) {
    return handleError(e);
  }
}

function readBrackets(fd: FormData, prefix: "lb" | "ot", rows: number): Bracket[] {
  const out: Bracket[] = [];
  for (let i = 0; i < rows; i++) {
    const rate = String(fd.get(`${prefix}_rate_${i}`) ?? "").trim();
    if (rate === "") continue;
    const upToRaw = String(fd.get(`${prefix}_upto_${i}`) ?? "").trim();
    const r = Number(rate.replace(",", "."));
    if (!Number.isFinite(r)) throw new UserError("errors.invalidRateRow", { row: i + 1 });
    let upTo: number | null = null;
    if (upToRaw !== "") {
      try { upTo = parseMoney(upToRaw); } catch { throw new UserError("errors.invalidRateRow", { row: i + 1 }); }
    }
    out.push({ upTo, rateBp: Math.round(r * 100) });
  }
  const err = validateBrackets(out);
  if (err) throw new UserError("errors.bracketTable", { table: `@settings.tax.tables.${prefix}`, error: `@bracket.${err.code}|${err.row ?? ""}` });
  return out;
}

export async function saveTaxRuleSetAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("tax.manage");
    const raw = formObject(fd);
    const data = z.object({
      name: z.string({ error: "validation.required" }).min(2).max(100),
      currency: currencyField,
      regime: z.enum(["STANDARD", "ART17A"]).default("STANDARD"),
      effectiveFrom: dateField,
      effectiveTo: optionalDate,
      calcMethod: z.enum(["ANNUALIZED", "MONTHLY_TABLE"]).default("ANNUALIZED"),
      taxFreeAnnual: moneyField,
      taxFreeMonthly: moneyField,
      lumpSumMode: z.enum(["PERCENT_CAPPED", "FIXED"]).default("PERCENT_CAPPED"),
      lumpSumMonthly: moneyField,
      verificationStatus: z.enum(["PENDING_VERIFICATION", "CONFLICT"]).default("PENDING_VERIFICATION"),
      taxCreditMonthly: moneyField,
      lumpSumRateBp: percentField,
      lumpSumCapAnnual: moneyField,
      aovRateBp: percentField,
      aovFranchiseMonthly: moneyField,
      childAllowanceExempt: moneyField,
      childAllowanceMaxChildren: numberField(0, 20),
      bonusExemptAnnual: moneyField,
      notes: optionalText(1000),
    }).parse(raw);
    await ensureCurrency(data.currency);
    const brackets = readBrackets(fd, "lb", 8);
    const overtimeBrackets = readBrackets(fd, "ot", 5);
    if (data.effectiveTo && data.effectiveTo < data.effectiveFrom) throw new UserError("validation.endAfterStart");
    const citations = parseCitations(raw.citations);
    // Any change resets verification: a rule is only VERIFIED through the explicit verification step.
    const payload = { ...data, brackets: brackets as unknown as Prisma.InputJsonValue, overtimeBrackets: overtimeBrackets as unknown as Prisma.InputJsonValue, citations: citations as unknown as Prisma.InputJsonValue, isVerified: false, verifiedUntil: null };
    if (raw.id) {
      const rs = await db.taxRuleSet.findFirst({ where: { id: raw.id, companyId: ctx.company.id } });
      if (!rs) throw new UserError("errors.ruleCompanyOnly");
      const locked = await db.payrollRun.count({ where: { taxRuleSetId: rs.id, status: { in: ["APPROVED", "PAID"] } } });
      if (locked) throw new UserError("errors.ruleLocked");
      await db.taxRuleSet.update({ where: { id: rs.id }, data: { ...payload, approvedAt: new Date(), approvedById: ctx.user.id } });
    } else {
      await db.taxRuleSet.create({ data: { ...payload, companyId: ctx.company.id, approvedAt: new Date(), approvedById: ctx.user.id } });
    }
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "tax_rules.save", entity: "TaxRuleSet", details: { name: data.name } });
    revalidatePath("/app/tax/rules");
    return ok((await getTranslations())("settings.tax.saved"));
  } catch (e) {
    return handleError(e);
  }
}

/** "source | article | subject" per line → citations. */
function parseCitations(text: string | undefined) {
  return (text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 30).map((l) => {
    const [source, article, ...rest] = l.split("|").map((x) => x.trim());
    return { source: (source ?? "").slice(0, 120), article: (article ?? "").slice(0, 40), subject: rest.join(" | ").slice(0, 300) };
  });
}

/**
 * Marks a company rule set as legally verified up to a date. Requires company.manage, a verification
 * date, the professional source/reviewer and an explicit confirmation. Payroll periods after that date
 * are again "pending legal validation".
 */
const verifySchema = z.object({
  verifiedUntil: dateField,
  reviewer: z.string({ error: "validation.required" }).min(3).max(200),
  confirm: z.literal("on", { error: "validation.confirmRequired" }),
});

export async function verifyTaxRuleSetAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("company.manage");
    const rs = await db.taxRuleSet.findFirst({ where: { id: String(fd.get("id")), companyId: ctx.company.id } });
    if (!rs) throw new UserError("errors.ruleVerifyCompanyOnly");
    const v = verifySchema.parse(formObject(fd));
    await db.taxRuleSet.update({ where: { id: rs.id }, data: { isVerified: true, verificationStatus: "VERIFIED", verifiedUntil: v.verifiedUntil, verifiedAt: new Date(), verifiedById: ctx.user.id, verifiedReviewer: v.reviewer } });
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "tax_rules.verified", entity: "TaxRuleSet", entityId: rs.id, details: { name: rs.name, verifiedUntil: v.verifiedUntil.toISOString().slice(0, 10), reviewer: v.reviewer } });
    revalidatePath("/app/tax/rules");
    return ok((await getTranslations())("settings.tax.verifiedMsg"));
  } catch (e) {
    return handleError(e);
  }
}

const roleEnum = z.enum(["OWNER", "ADMIN", "PAYROLL_MANAGER", "HR_MANAGER", "ACCOUNTANT"]);

export async function inviteUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("users.manage");
    const t = await getTranslations();
    const data = z.object({ name: z.string({ error: "validation.required" }).min(2).max(120), email: z.email("validation.email").transform((e) => e.toLowerCase()), role: roleEnum }).parse(formObject(fd));
    if (data.role === "OWNER" && ctx.role !== "OWNER") throw new UserError("errors.ownerOnlyAdd");
    let user = await db.user.findUnique({ where: { email: data.email } });
    let temp: string | null = null;
    if (!user) {
      temp = randomBytes(9).toString("base64url");
      user = await db.user.create({ data: { email: data.email, name: data.name, passwordHash: await bcrypt.hash(temp, 12), locale: ctx.user.locale } });
    }
    const exists = await db.membership.findUnique({ where: { userId_companyId: { userId: user.id, companyId: ctx.company.id } } });
    if (exists) throw new UserError("errors.alreadyMember");
    await db.membership.create({ data: { userId: user.id, companyId: ctx.company.id, role: data.role } });
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "user.invite", entity: "User", entityId: user.id, details: { role: data.role } });
    revalidatePath("/app/settings/users");
    return ok(temp ? t("settings.users.created", { email: data.email, password: temp }) : t("settings.users.existingAdded"));
  } catch (e) {
    return handleError(e);
  }
}

export async function changeRoleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("users.manage");
    const m = await db.membership.findFirst({ where: { id: String(fd.get("id")), companyId: ctx.company.id } });
    if (!m) throw new UserError("errors.notFound");
    const role = z.enum(["OWNER", "ADMIN", "PAYROLL_MANAGER", "HR_MANAGER", "ACCOUNTANT", "EMPLOYEE"]).parse(fd.get("role"));
    if (m.userId === ctx.user.id) throw new UserError("errors.ownRole");
    if ((role === "OWNER" || m.role === "OWNER") && ctx.role !== "OWNER") throw new UserError("errors.ownerOnlyChange");
    await db.membership.update({ where: { id: m.id }, data: { role } });
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "user.role_changed", entity: "Membership", entityId: m.id, details: { from: m.role, to: role } });
    revalidatePath("/app/settings/users");
    return ok((await getTranslations())("settings.users.roleUpdated"));
  } catch (e) {
    return handleError(e);
  }
}

export async function removeMemberAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("users.manage");
    const m = await db.membership.findFirst({ where: { id: String(fd.get("id")), companyId: ctx.company.id } });
    if (!m) throw new UserError("errors.notFound");
    if (m.userId === ctx.user.id) throw new UserError("errors.removeSelf");
    if (m.role === "OWNER" && ctx.role !== "OWNER") throw new UserError("errors.ownerOnlyRemove");
    await db.$transaction([
      db.membership.delete({ where: { id: m.id } }),
      db.session.updateMany({ where: { userId: m.userId, activeCompanyId: ctx.company.id }, data: { activeCompanyId: null } }),
    ]);
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "user.removed", entity: "Membership", entityId: m.id });
    revalidatePath("/app/settings/users");
    return ok((await getTranslations())("settings.users.removed"));
  } catch (e) {
    return handleError(e);
  }
}

const aovSchema = z.object({
  name: z.string({ error: "validation.required" }).min(2).max(100),
  currency: currencyField,
  effectiveFrom: dateField,
  effectiveTo: optionalDate,
  rateBp: percentField,
  base: z.enum(["TAXABLE_WAGE", "GROSS_WAGE"]),
  franchiseMonthly: moneyField,
  minMonthly: z.string().optional(),
  maxMonthly: z.string().optional(),
  employeeSharePct: percentField,
  exemptFromAge: z.string().optional().transform((v) => (v ? Number(v) : null)).pipe(z.number().int().min(14).max(100).nullable()),
  verificationStatus: z.enum(["PENDING_VERIFICATION", "CONFLICT"]).default("PENDING_VERIFICATION"),
  notes: optionalText(1000),
});

const optionalMoney = (v: string | undefined) => (v ? parseMoney(v) : null);

export async function saveAovRuleSetAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("tax.manage");
    const raw = formObject(fd);
    const d = aovSchema.parse(raw);
    await ensureCurrency(d.currency);
    if (d.effectiveTo && d.effectiveTo < d.effectiveFrom) throw new UserError("validation.endAfterStart");
    const payload = {
      name: d.name, currency: d.currency, effectiveFrom: d.effectiveFrom, effectiveTo: d.effectiveTo, rateBp: d.rateBp, base: d.base,
      franchiseMonthly: d.franchiseMonthly, minMonthly: optionalMoney(d.minMonthly), maxMonthly: optionalMoney(d.maxMonthly),
      employeeShareBp: d.employeeSharePct, exemptFromAge: d.exemptFromAge, verificationStatus: d.verificationStatus, verifiedUntil: null,
      citations: parseCitations(raw.citations) as unknown as Prisma.InputJsonValue, notes: d.notes,
    };
    if (raw.id) {
      const rs = await db.aovRuleSet.findFirst({ where: { id: raw.id, companyId: ctx.company.id } });
      if (!rs) throw new UserError("errors.ruleCompanyOnly");
      if (await db.payrollRun.count({ where: { aovRuleSetId: rs.id, status: { in: ["APPROVED", "PAID"] } } })) throw new UserError("errors.ruleLocked");
      await db.aovRuleSet.update({ where: { id: rs.id }, data: { ...payload, approvedAt: new Date(), approvedById: ctx.user.id } });
    } else {
      await db.aovRuleSet.create({ data: { ...payload, companyId: ctx.company.id, approvedAt: new Date(), approvedById: ctx.user.id } });
    }
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "aov_rules.save", entity: "AovRuleSet", details: { name: d.name, rateBp: d.rateBp } });
    revalidatePath("/app/tax/aov-rules");
    return ok((await getTranslations())("aovRules.saved"));
  } catch (e) {
    return handleError(e);
  }
}

export async function verifyAovRuleSetAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("company.manage");
    const rs = await db.aovRuleSet.findFirst({ where: { id: String(fd.get("id")), companyId: ctx.company.id } });
    if (!rs) throw new UserError("errors.ruleVerifyCompanyOnly");
    const v = verifySchema.parse(formObject(fd));
    await db.aovRuleSet.update({ where: { id: rs.id }, data: { verificationStatus: "VERIFIED", verifiedUntil: v.verifiedUntil, verifiedAt: new Date(), verifiedById: ctx.user.id, verifiedReviewer: v.reviewer } });
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "aov_rules.verified", entity: "AovRuleSet", entityId: rs.id, details: { name: rs.name, verifiedUntil: v.verifiedUntil.toISOString().slice(0, 10), reviewer: v.reviewer } });
    revalidatePath("/app/tax/aov-rules");
    return ok((await getTranslations())("settings.tax.verifiedMsg"));
  } catch (e) {
    return handleError(e);
  }
}

// ── Pay component configuration ──────────────────────────────────────────────

const CATEGORY_KIND: Record<string, "ALLOWANCE" | "DEDUCTION" | "EMPLOYER"> = {
  SALARY: "ALLOWANCE", ALLOWANCE: "ALLOWANCE", OVERTIME: "ALLOWANCE", BONUS: "ALLOWANCE", DEDUCTION: "DEDUCTION", EMPLOYER: "EMPLOYER",
};

const componentConfigSchema = z.object({
  code: z.string({ error: "validation.required" }).min(1).max(12).regex(/^[A-Z0-9+\-_]+$/i, "validation.code").transform((s) => s.toUpperCase()),
  nameNl: z.string({ error: "validation.required" }).min(2).max(100),
  nameEn: z.string({ error: "validation.required" }).min(2).max(100),
  category: z.enum(["SALARY", "ALLOWANCE", "OVERTIME", "BONUS", "DEDUCTION", "EMPLOYER"]),
  calcType: z.enum(["FIXED", "PERCENT_OF_BASE", "PERCENT_OF_COMPONENT", "HOURS_X_RATE", "DAYS_X_RATE", "QTY_X_PRICE", "FORMULA", "MANUAL"]),
  defaultAmount: moneyField,
  defaultRatePct: percentField,
  multiplierPct: z.string().optional().transform((v) => Math.round(Number((v ?? "100").replace(",", ".")) * 100)).pipe(z.number().min(0).max(100000)),
  unitPrice: moneyField,
  currency: z.string().regex(/^[A-Z]{3}$/, "validation.currency").optional(),
  baseComponentCode: optionalText(12),
  formula: optionalText(300),
  frequency: z.enum(["RECURRING", "ONE_OFF", "ANNUAL"]),
  taxTreatment: z.enum(["TAXABLE", "EXEMPT", "EXEMPT_UP_TO_LIMIT", "CHILD_ALLOWANCE", "SPECIAL_REWARD", "OVERTIME"]),
  exemptLimit: moneyField,
  aovIncluded: z.string().optional().transform((v) => v === "on"),
  pensionIncluded: z.string().optional().transform((v) => v === "on"),
  preTax: z.string().optional().transform((v) => v === "on"),
  benefitInKind: z.string().optional().transform((v) => v === "on"),
  glAccount: optionalText(40),
  effectiveFrom: optionalDate,
  effectiveTo: optionalDate,
  legalReference: optionalText(300),
  legalStatus: z.enum(["VERIFIED", "PARTIALLY_VERIFIED", "PENDING_VERIFICATION", "CONFLICT", "COMPANY_POLICY"]),
  approvalStatus: z.enum(["DRAFT", "APPROVED"]),
  isActive: z.string().optional().transform((v) => v === "on"),
  availableToAll: z.string().optional().transform((v) => v === "on"),
});

/**
 * Saves a pay component configuration. Gross/net/employer-cost treatment follows from the category and
 * cannot be overridden, so custom components cannot bypass the payroll tax configuration.
 */
export async function saveComponentConfigAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string | undefined;
  try {
    const ctx = await requirePermission("settings.manage");
    const raw = formObject(fd);
    const d = componentConfigSchema.parse(raw);
    const kind = CATEGORY_KIND[d.category];
    if (!raw.id && (SYSTEM_CODES.has(d.code) || ["LB", "LB-BB", "LB-OT", "AOV", "AOV-ER", "PENS", "PENS-ER", "BONUS", "OT1", "OT2", "UNPAID"].includes(d.code))) throw new UserError("errors.reservedCode");
    if (d.currency) await ensureCurrency(d.currency);
    if (d.effectiveFrom && d.effectiveTo && d.effectiveTo < d.effectiveFrom) throw new UserError("validation.endAfterStart");
    if (d.calcType === "PERCENT_OF_COMPONENT" && !d.baseComponentCode) throw new UserError("errors.baseComponentRequired");
    if (d.calcType === "FORMULA") {
      if (!d.formula) throw new UserError("errors.formulaRequired");
      try { formulaVariables(d.formula); } catch { throw new UserError("errors.formulaInvalid"); }
    }
    // Tax configuration guard rails
    const taxTreatment = kind === "ALLOWANCE" ? d.taxTreatment : "TAXABLE";
    if (d.category === "OVERTIME" && !["OVERTIME", "TAXABLE"].includes(taxTreatment)) throw new UserError("errors.treatmentNotAllowed");
    if (d.category === "BONUS" && !["SPECIAL_REWARD", "TAXABLE"].includes(taxTreatment)) throw new UserError("errors.treatmentNotAllowed");
    if (d.legalStatus === "VERIFIED" && ctx.role !== "OWNER" && ctx.role !== "ADMIN") throw new UserError("errors.forbidden");
    const data = {
      code: d.code, name: d.nameNl, nameNl: d.nameNl, nameEn: d.nameEn, category: d.category, kind, calcType: d.calcType,
      defaultAmount: d.defaultAmount, defaultRateBp: d.defaultRatePct, multiplierBp: d.multiplierPct, unitPrice: d.unitPrice, currency: d.currency ?? null,
      baseComponentCode: d.calcType === "PERCENT_OF_COMPONENT" ? d.baseComponentCode?.toUpperCase() ?? null : null, formula: d.calcType === "FORMULA" ? d.formula : null,
      frequency: d.frequency, taxTreatment, exemptLimit: d.exemptLimit,
      aovIncluded: kind === "ALLOWANCE" ? d.aovIncluded : false, pensionIncluded: kind === "ALLOWANCE" ? d.pensionIncluded : false,
      preTax: kind === "DEDUCTION" ? d.preTax : false,
      netEffect: kind === "DEDUCTION" ? ("DEDUCT" as const) : kind === "EMPLOYER" ? ("NONE" as const) : d.benefitInKind ? ("NONE" as const) : ("ADD" as const),
      employerCost: kind !== "DEDUCTION",
      glAccount: d.glAccount, effectiveFrom: d.effectiveFrom, effectiveTo: d.effectiveTo, legalReference: d.legalReference, legalStatus: d.legalStatus,
      approvalStatus: d.approvalStatus, isActive: d.isActive, availableToAll: d.availableToAll,
    };
    if (raw.id) {
      const existing = await db.payComponent.findFirst({ where: { id: raw.id, companyId: ctx.company.id } });
      if (!existing) throw new UserError("errors.notFound");
      await db.payComponent.update({ where: { id: existing.id }, data: { ...data, code: existing.code } });
      id = existing.id;
    } else {
      id = (await db.payComponent.create({ data: { ...data, companyId: ctx.company.id } })).id;
    }
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: raw.id ? "component.update" : "component.create", entity: "PayComponent", entityId: id, details: { code: d.code, taxTreatment, calcType: d.calcType } });
    revalidatePath("/app/settings/components");
    if (raw.id) return ok((await getTranslations())("settings.components.saved"));
  } catch (e) {
    return handleError(e);
  }
  redirect(`/app/settings/components/${id}?created=1`);
}

/** Quick (de)activation and dropdown availability from the component overview. */
export async function toggleComponentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("settings.manage");
    const field = z.enum(["isActive", "availableToAll"]).parse(fd.get("field"));
    const c = await db.payComponent.findFirst({ where: { id: String(fd.get("id")), companyId: ctx.company.id } });
    if (!c) throw new UserError("errors.notFound");
    const value = !c[field];
    await db.payComponent.update({ where: { id: c.id }, data: { [field]: value } });
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "component.toggle", entity: "PayComponent", entityId: c.id, details: { code: c.code, [field]: value } });
    revalidatePath("/app/settings/components");
    const t = await getTranslations();
    return ok(t(`components.toggled.${field}.${value ? "on" : "off"}`, { name: c.name }));
  } catch (e) {
    return handleError(e);
  }
}

/** Adopts entries of the central library into the company (all missing ones, or one code). */
export async function adoptLibraryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("settings.manage");
    const code = fd.get("code") ? String(fd.get("code")) : null;
    const existing = new Set((await db.payComponent.findMany({ where: { companyId: ctx.company.id }, select: { code: true } })).map((c) => c.code));
    const raw = await getLocale();
    const entries = COMPONENT_LIBRARY.filter((e) => !e.isSystem && !existing.has(e.code) && (!code || e.code === code));
    if (entries.length) {
      await db.payComponent.createMany({
        data: entries.map((e) => ({
          companyId: ctx.company.id, code: e.code, libraryCode: e.code, name: raw === "en" ? e.nameEn : e.nameNl, nameNl: e.nameNl, nameEn: e.nameEn,
          kind: e.kind, category: e.category, legalReference: e.legalReference ?? null, ...libraryDefaults(e),
        })),
      });
    }
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "component.library_adopted", entity: "PayComponent", details: { codes: entries.map((e) => e.code) } });
    revalidatePath("/app/settings/components");
    return ok((await getTranslations())("components.adopted", { count: entries.length }));
  } catch (e) {
    return handleError(e);
  }
}
