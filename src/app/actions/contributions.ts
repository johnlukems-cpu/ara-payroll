"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import type { ContributionScheme } from "@prisma/client";
import { db } from "@/lib/db";
import { AuthError, requirePermission } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { assertActiveCurrency } from "@/lib/server/rates";
import { formObject, handleError, ok, UserError, type ActionState } from "@/lib/server/action";
import { recalcOpenRuns } from "@/lib/server/pay-components";
import { calculateRun } from "@/lib/payroll/service";
import { CONTRIBUTION_LIBRARY } from "@/lib/payroll/library";
import { can } from "@/lib/permissions";
import { currencyField, dateField, moneyField, optionalDate, optionalText, percentField } from "@/lib/validation";

const checkbox = z.string().optional().transform((v) => v === "on" || v === "true");

const schemeSchema = z.object({
  type: z.enum(["HEALTH", "PENSION", "FVO"]),
  name: z.string({ error: "validation.required" }).min(2, "validation.required").max(80),
  basis: z.enum(["STATUTORY", "VOLUNTARY"]),
  method: z.enum(["PERCENTAGE", "FIXED"]),
  base: z.enum(["BASE_SALARY", "PENSION_BASE", "REGULAR_WAGE", "GROSS_WAGE"]),
  employeeRate: percentField,
  employerRate: percentField,
  employeeAmount: moneyField,
  employerAmount: moneyField,
  maxBase: moneyField,
  currency: currencyField,
  effectiveFrom: dateField,
  effectiveTo: optionalDate,
  isActive: checkbox,
  appliesToAll: checkbox,
  employeeTax: z.enum(["PRE_TAX", "AFTER_TAX"]),
  showOnPayslip: checkbox,
  legalStatus: z.enum(["VERIFIED", "PENDING_VERIFICATION", "CONFLICT", "COMPANY_POLICY"]),
  legalReference: optionalText(300),
  notes: optionalText(500),
});

/** Fields that change the calculation: changing them for a period already in approved payroll requires a new version. */
const CALC_FIELDS = ["method", "base", "employeeRateBp", "employerRateBp", "employeeAmount", "employerAmount", "maxBaseMonthly", "currency", "employeeTax", "effectiveFrom"] as const;

const overlaps = (a: { effectiveFrom: Date; effectiveTo: Date | null }, b: { effectiveFrom: Date; effectiveTo: Date | null }) =>
  a.effectiveFrom <= (b.effectiveTo ?? new Date(8.64e15)) && b.effectiveFrom <= (a.effectiveTo ?? new Date(8.64e15));

/** Was the scheme (in its current validity) part of approved or paid payroll? */
async function usedInFinalPayroll(s: ContributionScheme) {
  const runs = await db.payrollRun.findMany({ where: { companyId: s.companyId, status: { in: ["APPROVED", "PAID"] } }, select: { year: true, month: true, payslips: { select: { trace: true } } } });
  return runs.some((r) => r.payslips.some((p) => ((p.trace as { contributions?: { id: string }[] } | null)?.contributions ?? []).some((c) => c.id === s.id)));
}

/**
 * Creates or updates a contribution scheme (employee and employer share). Only administrators with
 * settings rights; marking a scheme as legally verified is reserved for owners and administrators.
 */
export async function saveSchemeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let createdId: string | undefined;
  try {
    const ctx = await requirePermission("settings.manage");
    const raw = formObject(fd);
    const d = schemeSchema.parse(raw);
    const t = await getTranslations();
    const fail = (field: string, key: string) => ({ ok: false, message: t("validation.fixFields"), errors: { [field]: [t(key as never)] }, ts: Date.now() });
    if (d.effectiveTo && d.effectiveTo < d.effectiveFrom) return fail("effectiveTo", "validation.endAfterStart");
    if (raw.maxBase && d.maxBase <= 0) return fail("maxBase", "validation.amountRequired");
    if (!(await assertActiveCurrency(d.currency))) throw new UserError("errors.currencyInactive", { code: d.currency });
    if (d.legalStatus === "VERIFIED" && ctx.role !== "OWNER" && ctx.role !== "ADMIN") throw new AuthError("errors.forbidden");
    const data = {
      type: d.type, name: d.name, basis: d.basis, method: d.method, base: d.base,
      employeeRateBp: d.method === "PERCENTAGE" ? d.employeeRate : 0, employerRateBp: d.method === "PERCENTAGE" ? d.employerRate : 0,
      employeeAmount: d.method === "FIXED" ? d.employeeAmount : 0, employerAmount: d.method === "FIXED" ? d.employerAmount : 0,
      maxBaseMonthly: d.method === "PERCENTAGE" && raw.maxBase ? d.maxBase : null,
      currency: d.currency, effectiveFrom: d.effectiveFrom, effectiveTo: d.effectiveTo, isActive: d.isActive, appliesToAll: d.appliesToAll,
      employeeTax: d.employeeTax, showOnPayslip: d.showOnPayslip, legalStatus: d.legalStatus, legalReference: d.legalReference, notes: d.notes,
    };
    // No invented rates: an active scheme for all employees needs a configured employee or employer share.
    const noShares = data.employeeRateBp === 0 && data.employerRateBp === 0 && data.employeeAmount === 0 && data.employerAmount === 0;
    if (d.isActive && d.appliesToAll && noShares) return fail(d.method === "FIXED" ? "employeeAmount" : "employeeRate", "errors.schemeNoRates");

    const existing = raw.id ? await db.contributionScheme.findFirst({ where: { id: raw.id, companyId: ctx.company.id } }) : null;
    if (raw.id && !existing) throw new UserError("errors.notFound");
    if (existing && existing.type !== d.type) throw new UserError("errors.schemeTypeLocked");
    if (existing && CALC_FIELDS.some((k) => String(existing[k] ?? "") !== String(data[k] ?? "")) && (await usedInFinalPayroll(existing))) {
      throw new UserError("errors.schemeUsedNewVersion");
    }

    if (d.isActive) {
      // Only one scheme of a type may apply to everyone in the same period.
      const others = await db.contributionScheme.findMany({ where: { companyId: ctx.company.id, type: d.type, isActive: true, NOT: existing ? { id: existing.id } : undefined } });
      const clash = others.find((o) => (o.appliesToAll || d.appliesToAll) && overlaps(o, data));
      if (clash) throw new UserError("errors.schemeOverlap", { name: clash.name });
      // Employees that already have a component deducting the same contribution would be charged twice.
      if (d.appliesToAll) {
        const conflicting = await db.employeePayComponent.findMany({
          where: {
            isActive: true, employee: { companyId: ctx.company.id, status: { not: "TERMINATED" } },
            component: { OR: [{ libraryCode: { in: CONTRIBUTION_LIBRARY[d.type] } }, { code: { in: CONTRIBUTION_LIBRARY[d.type] } }] },
            OR: [{ endDate: null }, { endDate: { gte: d.effectiveFrom } }],
          },
          include: { employee: true },
          take: 4,
        });
        if (conflicting.length) throw new UserError("errors.schemeConflictsAssignments", { names: conflicting.slice(0, 3).map((c) => `${c.employee.firstName} ${c.employee.lastName}`).join(", ") });
      }
    }

    if (existing) await db.contributionScheme.update({ where: { id: existing.id }, data });
    else createdId = (await db.contributionScheme.create({ data: { ...data, companyId: ctx.company.id } })).id;
    await audit({
      companyId: ctx.company.id, userId: ctx.user.id, action: existing ? "contribution.scheme_updated" : "contribution.scheme_created", entity: "ContributionScheme", entityId: existing?.id ?? createdId,
      details: { before: existing ? { ...Object.fromEntries(CALC_FIELDS.map((k) => [k, existing[k]])), isActive: existing.isActive } : null, after: { ...data, effectiveFrom: data.effectiveFrom.toISOString() } },
    });
    revalidatePath("/app/settings/contributions");
    if (existing) return ok(t("contrib.saved"));
  } catch (e) {
    return handleError(e);
  }
  redirect(`/app/settings/contributions?saved=${createdId}`);
}

/** New version of a scheme from a date: the current version ends the day before; history stays unchanged. */
export async function newSchemeVersionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const ctx = await requirePermission("settings.manage");
    const raw = formObject(fd);
    const from = dateField.parse(raw.effectiveFrom);
    const s = await db.contributionScheme.findFirst({ where: { id: String(raw.id), companyId: ctx.company.id } });
    if (!s) throw new UserError("errors.notFound");
    if (from <= s.effectiveFrom) throw new UserError("errors.versionAfterStart");
    const dayBefore = new Date(from.getTime() - 86_400_000);
    const { id: _id, createdAt: _c, updatedAt: _u, ...copy } = s;
    void _id; void _c; void _u;
    const created = await db.$transaction(async (tx) => {
      await tx.contributionScheme.update({ where: { id: s.id }, data: { effectiveTo: dayBefore } });
      return tx.contributionScheme.create({ data: { ...copy, effectiveFrom: from, effectiveTo: s.effectiveTo && s.effectiveTo > from ? s.effectiveTo : null } });
    });
    // Individual participation carries over to the new version.
    const enrollments = await db.employeeContribution.findMany({ where: { schemeId: s.id } });
    if (enrollments.length) {
      await db.employeeContribution.createMany({
        data: enrollments.map((e) => ({ employeeId: e.employeeId, schemeId: created.id, participates: e.participates, employeeRateBp: e.employeeRateBp, employerRateBp: e.employerRateBp, employeeAmount: e.employeeAmount, employerAmount: e.employerAmount, startDate: e.startDate, endDate: e.endDate, note: e.note })),
      });
    }
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "contribution.scheme_version", entity: "ContributionScheme", entityId: created.id, details: { previous: s.id, effectiveFrom: from.toISOString() } });
    id = created.id;
  } catch (e) {
    return handleError(e);
  }
  redirect(`/app/settings/contributions/${id}?version=1`);
}

const enrollmentSchema = z.object({
  employeeId: z.string(),
  schemeId: z.string({ error: "validation.required" }),
  participates: checkbox,
  employeeRate: z.string().optional(),
  employerRate: z.string().optional(),
  employeeAmount: z.string().optional(),
  employerAmount: z.string().optional(),
  startDate: optionalDate,
  endDate: optionalDate,
  note: optionalText(300),
});

/** Participation of one employee in a scheme: join/opt out and optional individual rates or amounts (blank = scheme). */
export async function saveEnrollmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("employees.edit");
    if (!can(ctx.role, "employees.viewSalary")) throw new AuthError("errors.forbidden");
    const t = await getTranslations();
    const d = enrollmentSchema.parse(formObject(fd));
    const [emp, scheme] = await Promise.all([
      db.employee.findFirst({ where: { id: d.employeeId, companyId: ctx.company.id } }),
      db.contributionScheme.findFirst({ where: { id: d.schemeId, companyId: ctx.company.id } }),
    ]);
    if (!emp || !scheme) throw new UserError("errors.notFound");
    if (d.startDate && d.endDate && d.endDate < d.startDate) return { ok: false, message: t("validation.fixFields"), errors: { endDate: [t("validation.endAfterStart")] }, ts: Date.now() };
    const errors: Record<string, string[]> = {};
    const pct = (k: "employeeRate" | "employerRate") => {
      const v = d[k];
      if (!v) return null;
      try { return percentField.parse(v); } catch { errors[k] = [t("validation.percent")]; return null; }
    };
    const money = (k: "employeeAmount" | "employerAmount") => {
      const v = d[k];
      if (!v) return null;
      try { return moneyField.parse(v); } catch { errors[k] = [t("validation.amount")]; return null; }
    };
    const data = {
      participates: d.participates,
      employeeRateBp: scheme.method === "PERCENTAGE" ? pct("employeeRate") : null,
      employerRateBp: scheme.method === "PERCENTAGE" ? pct("employerRate") : null,
      employeeAmount: scheme.method === "FIXED" ? money("employeeAmount") : null,
      employerAmount: scheme.method === "FIXED" ? money("employerAmount") : null,
      startDate: d.startDate, endDate: d.endDate, note: d.note,
    };
    if (Object.keys(errors).length) return { ok: false, message: t("validation.fixFields"), errors, ts: Date.now() };
    if (d.participates) {
      // No double deduction: another scheme of the same type, or a component deducting the same contribution.
      const other = await db.contributionScheme.findFirst({
        where: {
          companyId: ctx.company.id, type: scheme.type, isActive: true, NOT: { id: scheme.id },
          OR: [{ appliesToAll: true, enrollments: { none: { employeeId: emp.id, participates: false } } }, { enrollments: { some: { employeeId: emp.id, participates: true } } }],
        },
      });
      if (other && overlaps(other, scheme)) throw new UserError("errors.schemeOverlap", { name: other.name });
      const clash = await db.employeePayComponent.findFirst({
        where: { employeeId: emp.id, isActive: true, component: { OR: [{ libraryCode: { in: CONTRIBUTION_LIBRARY[scheme.type] } }, { code: { in: CONTRIBUTION_LIBRARY[scheme.type] } }] }, OR: [{ endDate: null }, { endDate: { gte: scheme.effectiveFrom } }] },
        include: { component: true },
      });
      if (clash) throw new UserError("errors.contributionDuplicateComponent", { component: clash.label ?? clash.component.name });
    }
    await db.employeeContribution.upsert({ where: { employeeId_schemeId: { employeeId: emp.id, schemeId: scheme.id } }, create: { ...data, employeeId: emp.id, schemeId: scheme.id }, update: data });
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "contribution.enrollment_saved", entity: "Employee", entityId: emp.id, details: { scheme: scheme.name, type: scheme.type, ...data } });
    const rec = await recalcOpenRuns(ctx.company.id, emp.id, calculateRun);
    revalidatePath(`/app/employees/${emp.id}`);
    return ok(`${t("contrib.enrollmentSaved", { name: scheme.name })}${rec.recalculated ? ` ${t("employee.recalculated", { count: rec.recalculated })}` : ""}`);
  } catch (e) {
    return handleError(e);
  }
}

export async function removeEnrollmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("employees.edit");
    if (!can(ctx.role, "employees.viewSalary")) throw new AuthError("errors.forbidden");
    const e = await db.employeeContribution.findFirst({ where: { id: String(fd.get("id")), employee: { companyId: ctx.company.id } }, include: { scheme: true } });
    if (!e) throw new UserError("errors.notFound");
    await db.employeeContribution.delete({ where: { id: e.id } });
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "contribution.enrollment_removed", entity: "Employee", entityId: e.employeeId, details: { scheme: e.scheme.name } });
    await recalcOpenRuns(ctx.company.id, e.employeeId, calculateRun);
    revalidatePath(`/app/employees/${e.employeeId}`);
    return ok((await getTranslations())("contrib.enrollmentRemoved"));
  } catch (e) {
    return handleError(e);
  }
}
