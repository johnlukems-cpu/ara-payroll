"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { getContext, requirePermission } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { storage } from "@/lib/server/storage";
import { can } from "@/lib/permissions";
import { formObject, handleError, ok, UserError, type ActionState } from "@/lib/server/action";
import { dateField, optionalDate, percentField } from "@/lib/validation";
import { workingDaysBetween } from "@/lib/leave";

const PARENTAL = ["PARENTAL", "MATERNITY", "PATERNITY", "ADOPTION"];
const DOC_MIME = new Set(["application/pdf", "image/png", "image/jpeg"]);

const schema = z.object({
  employeeId: z.string().optional(),
  leaveTypeId: z.string({ error: "validation.selectLeaveType" }),
  startDate: dateField,
  endDate: dateField,
  days: z.string().optional(),
  hours: z.string().optional(),
  schedulePercent: percentField,
  scheduleNote: z.string().max(300).optional(),
  childBirthDate: optionalDate,
  reason: z.string().max(500).optional(),
}).refine((d) => d.endDate >= d.startDate, { message: "validation.endAfterStart", path: ["endDate"] });

async function attachDocuments(fd: FormData, employeeId: string, companyId: string, leaveRequestId: string, userId: string) {
  for (const f of fd.getAll("documents")) {
    if (!(f instanceof File) || f.size === 0) continue;
    if (f.size > 8 * 1024 * 1024) throw new UserError("errors.fileTooLarge");
    if (!DOC_MIME.has(f.type)) throw new UserError("errors.receiptType");
    const key = await storage.put(Buffer.from(await f.arrayBuffer()), companyId);
    await db.employeeDocument.create({ data: { employeeId, leaveRequestId, fileName: f.name.replace(/[^\w.\- ()]/g, "_").slice(0, 150), mimeType: f.type, size: f.size, storageKey: key, uploadedBy: userId } });
  }
}

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
    const parental = PARENTAL.includes(type.category);
    // Maternity, paternity and adoption leave relate to a specific child (expected or actual date of birth / arrival).
    if (["MATERNITY", "PATERNITY", "ADOPTION"].includes(type.category) && !data.childBirthDate) throw new UserError("errors.childBirthDateRequired");
    const schedulePercentBp = data.schedulePercent || 10000;
    if (schedulePercentBp < 10000 && !type.allowPartTime) throw new UserError("errors.partTimeNotAllowed");
    const computed = workingDaysBetween(data.startDate, data.endDate);
    const days = data.days ? Number(data.days.replace(",", ".")) : computed;
    if (!Number.isFinite(days) || days <= 0 || days > 366) return { ok: false, message: t("leave.noWorkingDays"), errors: { days: [t("validation.invalid")] } };
    const hours = data.hours ? Number(data.hours.replace(",", ".")) : null;
    // Overlap with other absence is not allowed; part-time leave may combine with work but not with other leave.
    const overlap = await db.leaveRequest.findFirst({ where: { employeeId: employee.id, status: { in: ["PENDING", "APPROVED"] }, startDate: { lte: data.endDate }, endDate: { gte: data.startDate } } });
    if (overlap) return { ok: false, message: t("leave.overlap") };
    const direct = isStaff && !!data.employeeId && !parental;
    const req = await db.leaveRequest.create({
      data: {
        employeeId: employee.id, leaveTypeId: type.id, startDate: data.startDate, endDate: data.endDate, days, hours,
        schedulePercentBp, scheduleNote: data.scheduleNote, childBirthDate: data.childBirthDate, reason: data.reason,
        paymentStatus: parental ? "PENDING" : "NOT_APPLICABLE",
        // Leave entered by staff is approved directly, except parental leave which always goes through review.
        ...(direct ? { status: "APPROVED", approvedDays: days, decidedById: ctx.user.id, decidedAt: new Date() } : {}),
      },
    });
    await attachDocuments(fd, employee.id, ctx.company.id, req.id, ctx.user.id);
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "leave.request", entity: "LeaveRequest", entityId: req.id, details: { days, type: type.code, category: type.category } });
    revalidatePath("/app/leave");
    revalidatePath("/app/leave/parental");
    revalidatePath("/me/leave");
    return ok(direct ? t("leave.recorded") : t("leave.submitted"));
  } catch (e) {
    return handleError(e);
  }
}

export async function decideLeaveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("leave.approve");
    const raw = formObject(fd);
    const decision = z.enum(["APPROVED", "REJECTED"]).parse(raw.decision);
    const req = await db.leaveRequest.findFirst({ where: { id: String(raw.id), employee: { companyId: ctx.company.id } }, include: { employee: true, leaveType: true } });
    if (!req) throw new UserError("errors.notFound");
    if (req.status !== "PENDING") throw new UserError("errors.alreadyDecided");
    if (req.employee.userId === ctx.user.id) throw new UserError("errors.ownLeave");
    const approvedDays = raw.approvedDays ? Number(raw.approvedDays.replace(",", ".")) : req.days;
    if (decision === "APPROVED" && (!Number.isFinite(approvedDays) || approvedDays <= 0 || approvedDays > req.days * 2)) throw new UserError("errors.invalidValue", { value: raw.approvedDays ?? "" });
    const paymentStatus = raw.paymentStatus ? z.enum(["NOT_APPLICABLE", "PENDING", "PAID_BY_EMPLOYER", "PARTIALLY_PAID", "UNPAID", "PAID_BY_FUND"]).parse(raw.paymentStatus) : undefined;
    await db.leaveRequest.update({
      where: { id: req.id },
      data: { status: decision, decidedById: ctx.user.id, decidedAt: new Date(), ...(decision === "APPROVED" ? { approvedDays } : {}), ...(paymentStatus ? { paymentStatus } : {}) },
    });
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: `leave.${decision.toLowerCase()}`, entity: "LeaveRequest", entityId: req.id, details: { approvedDays, paymentStatus: paymentStatus ?? null } });
    revalidatePath("/app/leave");
    revalidatePath("/app/leave/parental");
    const t = await getTranslations();
    return ok(decision === "APPROVED" ? t("leave.approved") : t("leave.rejected"));
  } catch (e) {
    return handleError(e);
  }
}

export async function updateLeavePaymentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("leave.approve");
    const req = await db.leaveRequest.findFirst({ where: { id: String(fd.get("id")), employee: { companyId: ctx.company.id } } });
    if (!req) throw new UserError("errors.notFound");
    const paymentStatus = z.enum(["NOT_APPLICABLE", "PENDING", "PAID_BY_EMPLOYER", "PARTIALLY_PAID", "UNPAID", "PAID_BY_FUND"]).parse(fd.get("paymentStatus"));
    await db.leaveRequest.update({ where: { id: req.id }, data: { paymentStatus } });
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "leave.payment_status", entity: "LeaveRequest", entityId: req.id, details: { paymentStatus } });
    revalidatePath("/app/leave/parental");
    return ok((await getTranslations())("parental.paymentUpdated"));
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
    revalidatePath("/app/leave/parental");
    revalidatePath("/me/leave");
    return ok((await getTranslations())("leave.cancelled"));
  } catch (e) {
    return handleError(e);
  }
}

/** Manual leave balance correction (opening balance, carry-forward decision, settlement), recorded with a reason. */
export async function adjustLeaveBalanceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("leave.approve");
    const d = z.object({
      employeeId: z.string().min(1), leaveTypeId: z.string().min(1),
      year: z.coerce.number().int().min(2000).max(2100),
      days: z.coerce.number().min(-365).max(365).refine((v) => v !== 0 && Math.round(v * 2) === v * 2, "errors.invalidAdjustment"),
      reason: z.string({ error: "validation.required" }).trim().min(3, "validation.required").max(300),
    }).parse({ ...formObject(fd), days: String(fd.get("days") ?? "").replace(",", ".") });
    const [emp, type] = await Promise.all([
      db.employee.findFirst({ where: { id: d.employeeId, companyId: ctx.company.id } }),
      db.leaveType.findFirst({ where: { id: d.leaveTypeId, companyId: ctx.company.id } }),
    ]);
    if (!emp || !type) throw new UserError("errors.notFound");
    const adj = await db.leaveBalanceAdjustment.create({ data: { ...d, createdById: ctx.user.id } });
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "leave.balance_adjusted", entity: "Employee", entityId: emp.id, details: { adjustmentId: adj.id, leaveType: type.code, year: d.year, days: d.days, reason: d.reason } });
    revalidatePath("/app/leave", "layout");
    return ok((await getTranslations())("leave.adjusted"));
  } catch (err) {
    return handleError(err);
  }
}
