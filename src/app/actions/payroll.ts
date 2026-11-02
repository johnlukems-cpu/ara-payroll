"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { formObject, handleError, ok, UserError, type ActionState } from "@/lib/server/action";
import { calculateRun, eligibleEmployeesWhere } from "@/lib/payroll/service";
import { createFormat, parseMoney } from "@/lib/format";
import { assertActiveCurrency } from "@/lib/server/rates";
import { getI18n } from "@/lib/server/i18n";
import { dateField } from "@/lib/validation";

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
      const data = {
        hoursWorked: hw === null || hw === "" ? null : num(hw, 744),
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
    revalidatePath(`/app/payroll/${run.id}`);
    return ok((await getTranslations())("run.inputsSaved"));
  } catch (e) {
    return handleError(e);
  }
}

export async function addAdjustmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("payroll.run");
    const raw = formObject(fd);
    const run = await loadRun(ctx.company.id, String(raw.runId));
    assertEditable(run.status);
    const data = z.object({
      employeeId: z.string({ error: "validation.selectEmployee" }),
      componentId: z.string({ error: "validation.selectComponent" }),
      amount: z.string({ error: "validation.required" }),
      currency: z.string().regex(/^[A-Z]{3}$/, "validation.currency").optional(),
      description: z.string().max(120).optional(),
    }).parse(raw);
    let amount = 0;
    try { amount = parseMoney(data.amount); } catch { /* handled below */ }
    if (amount <= 0) throw new UserError("errors.positiveAmount");
    if (data.currency && !(await assertActiveCurrency(data.currency))) throw new UserError("errors.currencyInactive", { code: data.currency });
    const [emp, comp] = await Promise.all([
      db.employee.findFirst({ where: { id: data.employeeId, companyId: ctx.company.id } }),
      db.payComponent.findFirst({ where: { id: data.componentId, companyId: ctx.company.id } }),
    ]);
    if (!emp || !comp) throw new UserError("errors.invalidEmployeeOrComponent");
    const contract = await db.contract.findFirst({ where: { employeeId: emp.id }, orderBy: { startDate: "desc" } });
    const currency = data.currency ?? contract?.salaryCurrency ?? ctx.company.currency;
    await db.$transaction([
      db.payrollAdjustment.create({ data: { runId: run.id, employeeId: emp.id, componentId: comp.id, amount, currency, description: data.description } }),
      db.payrollRun.update({ where: { id: run.id }, data: { status: "DRAFT" } }),
    ]);
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "payroll.adjustment_added", entity: "PayrollRun", entityId: run.id, details: { employee: emp.employeeNumber, component: comp.code, amount, currency } });
    revalidatePath(`/app/payroll/${run.id}`);
    return ok((await getTranslations())("run.adjAdded"));
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
    revalidatePath(`/app/payroll/${adj.runId}`);
    return ok((await getTranslations())("run.adjRemoved"));
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
    await db.payrollRun.update({ where: { id: run.id }, data: { status: "APPROVED", approvedById: ctx.user.id, approvedAt: new Date() } });
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "payroll.approve", entity: "PayrollRun", entityId: run.id, details: { totalNet: run.totalNet } });
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
