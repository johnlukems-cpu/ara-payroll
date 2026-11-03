"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { formObject, handleError, ok, UserError, type ActionState } from "@/lib/server/action";
import { calculateRun, eligibleEmployeesWhere } from "@/lib/payroll/service";
import { createFormat, parseMoney } from "@/lib/format";
import { assertActiveCurrency } from "@/lib/server/rates";
import { getI18n } from "@/lib/server/i18n";
import { assertPeriodReopenable, prepareMonthlyDeclaration } from "@/lib/server/declarations";
import { dateField } from "@/lib/validation";
import { buildLegalSnapshot } from "@/lib/server/legal-snapshot";
import { assertNoIncidentalDuplicate, assertPensionNotDouble, missingStatutoryContributions, parseOverrides, resolveComponent } from "@/lib/server/pay-components";

async function loadRun(companyId: string, runId: string) {
  const run = await db.payrollRun.findFirst({ where: { id: runId, companyId } });
  if (!run) throw new UserError("errors.notFound");
  return run;
}

function assertEditable(status: string) {
  if (status === "APPROVED" || status === "PAID") throw new UserError("errors.runLockedEdit");
}

export async function createRunAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const ctx = await requirePermission("payroll.run");
    const data = z.object({
      year: z.coerce.number().int().min(2000).max(2100),
      month: z.coerce.number().int().min(1).max(12),
      payDate: dateField,
      notes: z.string().max(500).optional(),
    }).parse(formObject(fd));
    const exists = await db.payrollRun.findUnique({ where: { companyId_year_month: { companyId: ctx.company.id, year: data.year, month: data.month } } });
    if (exists) {
      const { t, f } = await getI18n();
      return { ok: false, message: t("payroll.exists", { period: f.period(data.year, data.month) }) };
    }
    const run = await db.payrollRun.create({ data: { ...data, companyId: ctx.company.id, createdById: ctx.user.id } });
    id = run.id;
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "payroll.create", entity: "PayrollRun", entityId: id, details: { period: createFormat("en").period(data.year, data.month) } });
  } catch (e) {
    return handleError(e);
  }
  redirect(`/app/payroll/${id}`);
}

const num = (v: FormDataEntryValue | null, max: number) => {
  const n = v === null || v === "" ? 0 : Number(String(v).replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > max) throw new UserError("errors.invalidValue", { value: String(v) });
  return n;
};

/** Saves the variable inputs grid (hours, overtime, bonus, unpaid days) for all employees in a run. */
export async function saveInputsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("payroll.run");
    const run = await loadRun(ctx.company.id, String(fd.get("runId")));
    assertEditable(run.status);
    const employees = await db.employee.findMany({ where: eligibleEmployeesWhere(ctx.company.id, run.year, run.month), select: { id: true } });
    const ops = employees.map((e) => {
      const hw = fd.get(`hours_${e.id}`);
      const dw = fd.get(`days_${e.id}`);
      const data = {
        hoursWorked: hw === null || hw === "" ? null : num(hw, 744),
        daysWorked: dw === null || dw === "" ? null : num(dw, 31),
        overtime1Hours: num(fd.get(`ot1_${e.id}`), 400),
        overtime2Hours: num(fd.get(`ot2_${e.id}`), 400),
        bonus: parseMoney(String(fd.get(`bonus_${e.id}`) ?? "")),
        unpaidDays: num(fd.get(`unpaid_${e.id}`), 31),
      };
      if (data.bonus < 0) throw new UserError("errors.positiveAmount");
      return db.payrollInput.upsert({
        where: { runId_employeeId: { runId: run.id, employeeId: e.id } },
        create: { runId: run.id, employeeId: e.id, ...data },
        update: data,
      });
    });
    await db.$transaction([...ops, db.payrollRun.update({ where: { id: run.id }, data: { status: "DRAFT" } })]);
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "payroll.inputs_saved", entity: "PayrollRun", entityId: run.id });
    const t = await getTranslations();
    const suffix = await recalcAfterChange(run.id, t);
    revalidatePath(`/app/payroll/${run.id}`, "layout");
    return ok(`${t("run.inputsSaved")}${suffix}`);
  } catch (e) {
    return handleError(e);
  }
}

/**
 * Recalculates a run after its inputs changed so net pay is always up to date. When the calculation
 * cannot run (e.g. a missing exchange rate) the run stays in draft and the reason is reported.
 */
async function recalcAfterChange(runId: string, t: Awaited<ReturnType<typeof getTranslations>>): Promise<string> {
  try {
    await calculateRun(runId);
    return ` ${t("run.recalculated")}`;
  } catch (e) {
    await db.payrollRun.update({ where: { id: runId }, data: { status: "DRAFT" } });
    const err = await handleError(e).catch(() => null);
    return ` ${t("run.recalcPending", { reason: err?.message ?? "" })}`;
  }
}

/**
 * Adds an incidental allowance or deduction to the payslips of one or more employees in a run.
 * Statutory deductions are calculated automatically and cannot be added; a component that already
 * applies as a fixed component of the employee requires explicit confirmation (no silent double entry).
 */
export async function addAdjustmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("payroll.run");
    const raw = formObject(fd);
    const t = await getTranslations();
    const run = await loadRun(ctx.company.id, String(raw.runId));
    assertEditable(run.status);
    const employeeIds = [...new Set(fd.getAll("employeeIds").map(String).filter(Boolean).concat(raw.employeeId ? [raw.employeeId] : []))];
    if (employeeIds.length === 0) return { ok: false, message: t("validation.selectEmployee"), errors: { employeeIds: [t("validation.selectEmployee")] }, ts: Date.now() };
    if (!raw.component && !raw.componentId) return { ok: false, message: t("validation.selectComponent"), errors: { component: [t("validation.selectComponent")] }, ts: Date.now() };
    const description = raw.description || raw.label || null;
    if (description && description.length > 120) throw new UserError("errors.invalidValue", { value: description.slice(0, 20) });
    const allowDuplicate = raw.allowDuplicate === "on";
    const comp = await resolveComponent(ctx.company.id, raw.component ?? raw.componentId!, await getLocale());
    const employees = await db.employee.findMany({
      where: { ...eligibleEmployeesWhere(ctx.company.id, run.year, run.month), id: { in: employeeIds } },
      include: { contracts: { orderBy: { startDate: "desc" }, take: 1 } },
    });
    if (employees.length !== employeeIds.length) throw new UserError("errors.invalidEmployeeOrComponent");
    const rows = [];
    for (const emp of employees) {
      const { errors, values } = await parseOverrides(ctx.company.id, comp, raw, { incidental: true, parseMoney, defaultCurrency: emp.contracts[0]?.salaryCurrency ?? ctx.company.currency });
      if (Object.keys(errors).length) return { ok: false, message: t("validation.fixFields"), errors: Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, [t(v as never)]])), ts: Date.now() };
      if (values.currency && !(await assertActiveCurrency(values.currency))) throw new UserError("errors.currencyInactive", { code: values.currency });
      await assertPensionNotDouble(emp.id, comp);
      try {
        await assertNoIncidentalDuplicate(run, emp.id, comp, description, allowDuplicate);
      } catch (e) {
        if (e instanceof UserError && employees.length > 1) throw new UserError(e.key, { ...e.values, name: `${e.values?.name ?? comp.name} (${emp.firstName} ${emp.lastName})` });
        throw e;
      }
      rows.push({ runId: run.id, employeeId: emp.id, componentId: comp.id, description, allowDuplicate, ...values });
    }
    await db.$transaction([
      db.payrollAdjustment.createMany({ data: rows }),
      db.payrollRun.update({ where: { id: run.id }, data: { status: "DRAFT" } }),
    ]);
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "payroll.adjustment_added", entity: "PayrollRun", entityId: run.id, details: { employees: employees.map((e) => e.employeeNumber), component: comp.code, amount: rows[0]?.amount, rateBp: rows[0]?.rateBp, currency: rows[0]?.currency, taxOverride: rows[0]?.taxOverride, allowDuplicate } });
    const suffix = await recalcAfterChange(run.id, t);
    revalidatePath(`/app/payroll/${run.id}`, "layout");
    return ok(`${t("run.adjAddedCount", { count: rows.length, name: description ?? comp.name })}${suffix}`);
  } catch (e) {
    return handleError(e);
  }
}

/** Overrides the amount of an employee's fixed component for this run only (replaces it; never adds a second line). */
export async function overrideFixedAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("payroll.run");
    const raw = formObject(fd);
    const t = await getTranslations();
    const run = await loadRun(ctx.company.id, String(raw.runId));
    assertEditable(run.status);
    const a = await db.employeePayComponent.findFirst({ where: { id: String(raw.assignmentId), employee: { companyId: ctx.company.id } } });
    if (!a) throw new UserError("errors.notFound");
    let amount: number;
    try { amount = parseMoney(raw.amount); } catch { amount = -1; }
    if (amount < 0) return { ok: false, message: t("validation.fixFields"), errors: { amount: [t("validation.amount")] }, ts: Date.now() };
    const currency = raw.currency ?? a.currency ?? (await db.contract.findFirst({ where: { employeeId: a.employeeId }, orderBy: { startDate: "desc" } }))?.salaryCurrency ?? ctx.company.currency;
    if (!(await assertActiveCurrency(currency))) throw new UserError("errors.currencyInactive", { code: currency });
    await db.$transaction([
      db.payrollAdjustment.deleteMany({ where: { runId: run.id, assignmentId: a.id } }),
      db.payrollAdjustment.create({ data: { runId: run.id, employeeId: a.employeeId, componentId: a.componentId, assignmentId: a.id, amount, currency, calcType: "FIXED", description: a.label } }),
      db.payrollRun.update({ where: { id: run.id }, data: { status: "DRAFT" } }),
    ]);
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "payroll.fixed_override", entity: "PayrollRun", entityId: run.id, details: { assignmentId: a.id, amount, currency } });
    const suffix = await recalcAfterChange(run.id, t);
    revalidatePath(`/app/payroll/${run.id}`, "layout");
    return ok(`${t("run.overrideSaved")}${suffix}`);
  } catch (e) {
    return handleError(e);
  }
}

export async function removeAdjustmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("payroll.run");
    const adj = await db.payrollAdjustment.findFirst({ where: { id: String(fd.get("id")), run: { companyId: ctx.company.id } }, include: { run: true } });
    if (!adj) throw new UserError("errors.notFound");
    assertEditable(adj.run.status);
    await db.$transaction([
      db.payrollAdjustment.delete({ where: { id: adj.id } }),
      db.payrollRun.update({ where: { id: adj.runId }, data: { status: "DRAFT" } }),
    ]);
    const t = await getTranslations();
    const suffix = await recalcAfterChange(adj.runId, t);
    revalidatePath(`/app/payroll/${adj.runId}`, "layout");
    return ok(`${t(adj.assignmentId ? "run.overrideRemoved" : "run.adjRemoved")}${suffix}`);
  } catch (e) {
    return handleError(e);
  }
}

export async function calculateRunAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("payroll.run");
    const run = await loadRun(ctx.company.id, String(fd.get("runId")));
    const res = await calculateRun(run.id);
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "payroll.calculate", entity: "PayrollRun", entityId: run.id, details: { payslips: res.count, skipped: res.skipped } });
    revalidatePath(`/app/payroll/${run.id}`);
    const t = await getTranslations();
    const skipped = res.skipped.length ? ` ${t("run.skipped", { list: res.skipped.map((s) => `${s.name} (${t(`run.skipReasons.${s.reason}` as never)})`).join("; ") })}` : "";
    return ok(`${t("run.calculated", { count: res.count })}${skipped}`);
  } catch (e) {
    return handleError(e);
  }
}

export async function approveRunAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let runId: string;
  try {
    const ctx = await requirePermission("payroll.approve");
    const run = await loadRun(ctx.company.id, String(fd.get("runId")));
    if (run.status !== "CALCULATED") throw new UserError("errors.onlyCalculatedApprove");
    if (run.employeeCount === 0) throw new UserError("errors.noPayslips");
    // Statutory rules not (yet) legally validated: approval requires an explicit acknowledgement and is recorded as such.
    // A required statutory configuration (e.g. a statutory contribution scheme without approved rates) blocks finalising.
    const missing = await missingStatutoryContributions(ctx.company.id, run.year, run.month);
    if (missing.length) {
      const t = await getTranslations();
      throw new UserError("errors.statutoryConfigMissing", { list: missing.map((m) => t(`enums.contributionType.${m.type}`)).join(", ") });
    }
    const pending = run.legalStatus !== "VALIDATED";
    if (pending && fd.get("acknowledgePending") !== "on") throw new UserError("errors.acknowledgeLegalPending");
    // Contracts, leave, exchange rates, tax rules or components may have changed since the calculation.
    // Recalculate first and refuse approval when anything changed, so the approver always approves current figures.
    const fingerprint = async () => {
      const slips = await db.payslip.findMany({ where: { runId: run.id }, select: { employeeId: true, grossPay: true, totalDeductions: true, netPay: true, netPayPayment: true, legalStatus: true }, orderBy: { employeeId: "asc" } });
      return JSON.stringify(slips);
    };
    const before = await fingerprint();
    await calculateRun(run.id);
    if ((await fingerprint()) !== before) {
      revalidatePath(`/app/payroll/${run.id}`, "layout");
      throw new UserError("errors.changedSinceCalculation");
    }
    const fresh = await db.payrollRun.findUniqueOrThrow({ where: { id: run.id } });
    if (fresh.legalStatus !== "VALIDATED" && fd.get("acknowledgePending") !== "on") throw new UserError("errors.acknowledgeLegalPending");
    // Conditional update: only a still-CALCULATED run is approved (guards against concurrent changes).
    // Historical snapshot of the statutory rates and parameters used (never changed by later rule changes).
    const legalSnapshot = await buildLegalSnapshot(run.id);
    const approved = await db.payrollRun.updateMany({ where: { id: run.id, status: "CALCULATED" }, data: { status: "APPROVED", approvedById: ctx.user.id, approvedAt: new Date(), legalAcknowledgedById: fresh.legalStatus !== "VALIDATED" ? ctx.user.id : null, legalSnapshot } });
    if (approved.count !== 1) throw new UserError("errors.onlyCalculatedApprove");
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "payroll.approve", entity: "PayrollRun", entityId: run.id, details: { totalNet: fresh.totalNet, legalStatus: fresh.legalStatus } });
    // Automatic preparation of the LB/AOV declaration draft for this period.
    await prepareMonthlyDeclaration(ctx.company.id, run.year, run.month, ctx.user.id);
    runId = run.id;
  } catch (e) {
    return handleError(e);
  }
  redirect(`/app/payroll/${runId}?notice=approved`);
}

export async function reopenRunAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let runId: string;
  try {
    const ctx = await requirePermission("payroll.approve");
    const run = await loadRun(ctx.company.id, String(fd.get("runId")));
    if (run.status !== "APPROVED") throw new UserError("errors.onlyApprovedReopen");
    await assertPeriodReopenable(ctx.company.id, run.year, run.month);
    await db.payrollRun.update({ where: { id: run.id }, data: { status: "CALCULATED", approvedById: null, approvedAt: null } });
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "payroll.reopen", entity: "PayrollRun", entityId: run.id });
    runId = run.id;
  } catch (e) {
    return handleError(e);
  }
  redirect(`/app/payroll/${runId}?notice=reopened`);
}

export async function markPaidAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let runId: string;
  try {
    const ctx = await requirePermission("payroll.approve");
    const run = await loadRun(ctx.company.id, String(fd.get("runId")));
    if (run.status !== "APPROVED") throw new UserError("errors.approveBeforePaid");
    await db.payrollRun.update({ where: { id: run.id }, data: { status: "PAID", paidAt: new Date() } });
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "payroll.paid", entity: "PayrollRun", entityId: run.id });
    runId = run.id;
  } catch (e) {
    return handleError(e);
  }
  redirect(`/app/payroll/${runId}?notice=paid`);
}

export async function deleteRunAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("payroll.run");
    const run = await loadRun(ctx.company.id, String(fd.get("runId")));
    assertEditable(run.status);
    await db.payrollRun.delete({ where: { id: run.id } });
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "payroll.delete", entity: "PayrollRun", entityId: run.id, details: { period: createFormat("en").period(run.year, run.month) } });
  } catch (e) {
    return handleError(e);
  }
  redirect("/app/payroll");
}
