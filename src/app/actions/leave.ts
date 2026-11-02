"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { getContext, requirePermission } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { can } from "@/lib/permissions";
import { formObject, handleError, ok, UserError, type ActionState } from "@/lib/server/action";
import { dateField } from "@/lib/validation";
import { workingDaysBetween } from "@/lib/leave";

const schema = z.object({
  employeeId: z.string().optional(),
  leaveTypeId: z.string({ error: "validation.selectLeaveType" }),
  startDate: dateField,
  endDate: dateField,
  days: z.string().optional(),
  reason: z.string().max(500).optional(),
}).refine((d) => d.endDate >= d.startDate, { message: "validation.endAfterStart", path: ["endDate"] });

/** Staff can request on behalf of any employee; employees can only request for themselves. */
export async function requestLeaveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await getContext();
    if (!ctx?.company || !ctx.role) throw new UserError("errors.notSignedIn");
    const t = await getTranslations();
    const data = schema.parse(formObject(fd));
    const isStaff = can(ctx.role, "leave.approve");
    const employee = isStaff && data.employeeId
      ? await db.employee.findFirst({ where: { id: data.employeeId, companyId: ctx.company.id } })
      : await db.employee.findFirst({ where: { userId: ctx.user.id, companyId: ctx.company.id } });
    if (!employee) throw new UserError("errors.notFound");
    const type = await db.leaveType.findFirst({ where: { id: data.leaveTypeId, companyId: ctx.company.id } });
    if (!type) throw new UserError("errors.invalidLeaveType");
    const computed = workingDaysBetween(data.startDate, data.endDate);
    const days = data.days ? Number(data.days.replace(",", ".")) : computed;
    if (!Number.isFinite(days) || days <= 0 || days > 366) return { ok: false, message: t("leave.noWorkingDays"), errors: { days: [t("validation.invalid")] } };
    const overlap = await db.leaveRequest.findFirst({ where: { employeeId: employee.id, status: { in: ["PENDING", "APPROVED"] }, startDate: { lte: data.endDate }, endDate: { gte: data.startDate } } });
    if (overlap) return { ok: false, message: t("leave.overlap") };
    const req = await db.leaveRequest.create({
      data: {
        employeeId: employee.id, leaveTypeId: type.id, startDate: data.startDate, endDate: data.endDate, days, reason: data.reason,
        // Leave entered by staff is approved directly.
        ...(isStaff && data.employeeId ? { status: "APPROVED", decidedById: ctx.user.id, decidedAt: new Date() } : {}),
      },
    });
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "leave.request", entity: "LeaveRequest", entityId: req.id, details: { days, type: type.code } });
    revalidatePath("/app/leave");
    revalidatePath("/me");
    return ok(isStaff && data.employeeId ? t("leave.recorded") : t("leave.submitted"));
  } catch (e) {
    return handleError(e);
  }
}

export async function decideLeaveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("leave.approve");
    const id = String(fd.get("id"));
    const decision = z.enum(["APPROVED", "REJECTED"]).parse(fd.get("decision"));
    const req = await db.leaveRequest.findFirst({ where: { id, employee: { companyId: ctx.company.id } }, include: { employee: true } });
    if (!req) throw new UserError("errors.notFound");
    if (req.status !== "PENDING") throw new UserError("errors.alreadyDecided");
    if (req.employee.userId === ctx.user.id) throw new UserError("errors.ownLeave");
    await db.leaveRequest.update({ where: { id }, data: { status: decision, decidedById: ctx.user.id, decidedAt: new Date() } });
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: `leave.${decision.toLowerCase()}`, entity: "LeaveRequest", entityId: id });
    revalidatePath("/app/leave");
    const t = await getTranslations();
    return ok(decision === "APPROVED" ? t("leave.approved") : t("leave.rejected"));
  } catch (e) {
    return handleError(e);
  }
}

export async function cancelLeaveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await getContext();
    if (!ctx?.company || !ctx.role) throw new UserError("errors.notSignedIn");
    const id = String(fd.get("id"));
    const req = await db.leaveRequest.findFirst({ where: { id, employee: { companyId: ctx.company.id } }, include: { employee: true } });
    if (!req) throw new UserError("errors.notFound");
    const own = req.employee.userId === ctx.user.id;
    if (!own && !can(ctx.role, "leave.approve")) throw new UserError("errors.notAllowed");
    if (own && !can(ctx.role, "leave.approve") && req.status !== "PENDING") throw new UserError("errors.onlyPendingCancel");
    await db.leaveRequest.update({ where: { id }, data: { status: "CANCELLED" } });
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "leave.cancel", entity: "LeaveRequest", entityId: id });
    revalidatePath("/app/leave");
    revalidatePath("/me");
    return ok((await getTranslations())("leave.cancelled"));
  } catch (e) {
    return handleError(e);
  }
}
