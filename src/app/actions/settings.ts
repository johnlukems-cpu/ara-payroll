"use server";

import { revalidatePath } from "next/cache";
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
import { currencyField, dateField, moneyField, numberField, optionalText, percentField } from "@/lib/validation";
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
    const data = z.object({
      code: z.string({ error: "validation.required" }).min(1).max(10).transform((s) => s.toUpperCase()),
      name: z.string({ error: "validation.required" }).min(2).max(80),
      annualEntitlementDays: z.string().optional().transform((v) => Number((v ?? "0").replace(",", "."))).pipe(z.number().min(0).max(365)),
      isPaid: z.string().optional().transform((v) => v === "on"),
    }).parse(raw);
    if (raw.id) {
      const lt = await db.leaveType.findFirst({ where: { id: raw.id, companyId: ctx.company.id } });
      if (!lt) throw new UserError("errors.notFound");
      await db.leaveType.update({ where: { id: lt.id }, data });
    } else {
      await db.leaveType.create({ data: { ...data, companyId: ctx.company.id } });
    }
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
    const ctx = await requirePermission("settings.manage");
    const raw = formObject(fd);
    const data = z.object({
      name: z.string({ error: "validation.required" }).min(2).max(100),
      currency: currencyField,
      effectiveFrom: dateField,
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
    const payload = { ...data, brackets: brackets as unknown as Prisma.InputJsonValue, overtimeBrackets: overtimeBrackets as unknown as Prisma.InputJsonValue, isVerified: false };
    if (raw.id) {
      const rs = await db.taxRuleSet.findFirst({ where: { id: raw.id, companyId: ctx.company.id } });
      if (!rs) throw new UserError("errors.ruleCompanyOnly");
      const locked = await db.payrollRun.count({ where: { taxRuleSetId: rs.id, status: { in: ["APPROVED", "PAID"] } } });
      if (locked) throw new UserError("errors.ruleLocked");
      await db.taxRuleSet.update({ where: { id: rs.id }, data: payload });
    } else {
      await db.taxRuleSet.create({ data: { ...payload, companyId: ctx.company.id } });
    }
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "tax_rules.save", entity: "TaxRuleSet", details: { name: data.name } });
    revalidatePath("/app/settings/tax");
    return ok((await getTranslations())("settings.tax.saved"));
  } catch (e) {
    return handleError(e);
  }
}

export async function verifyTaxRuleSetAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("company.manage");
    const rs = await db.taxRuleSet.findFirst({ where: { id: String(fd.get("id")), companyId: ctx.company.id } });
    if (!rs) throw new UserError("errors.ruleVerifyCompanyOnly");
    await db.taxRuleSet.update({ where: { id: rs.id }, data: { isVerified: true } });
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "tax_rules.verified", entity: "TaxRuleSet", entityId: rs.id, details: { name: rs.name } });
    revalidatePath("/app/settings/tax");
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
