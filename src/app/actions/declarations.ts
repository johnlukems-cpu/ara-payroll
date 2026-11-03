"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/server/auth";
import { formObject, handleError, ok, UserError, type ActionState } from "@/lib/server/action";
import { storage } from "@/lib/server/storage";
import {
  createSupplementary, generateFiles, loadDeclaration, prepareAnnualDeclaration, prepareMonthlyDeclaration,
  recalculateDeclaration, transition,
} from "@/lib/server/declarations";
import { dateField } from "@/lib/validation";
import { isLocale } from "@/i18n/config";

const path = (id: string) => `/app/tax/declarations/${id}`;
const done = async (id: string, key: string) => {
  revalidatePath(path(id));
  revalidatePath("/app/tax");
  return ok((await getTranslations())(key as never));
};

export async function recalculateDeclarationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("declarations.prepare");
    const d = await loadDeclaration(ctx.company.id, String(fd.get("id")));
    await recalculateDeclaration(d, ctx.user.id);
    return done(d.id, "decl.msg.recalculated");
  } catch (e) {
    return handleError(e);
  }
}

export async function submitForReviewAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("declarations.prepare");
    const d = await loadDeclaration(ctx.company.id, String(fd.get("id")));
    await transition(d, "submitForReview", ctx.user.id);
    return done(d.id, "decl.msg.underReview");
  } catch (e) {
    return handleError(e);
  }
}

export async function returnToCalculatedAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("declarations.approve");
    const d = await loadDeclaration(ctx.company.id, String(fd.get("id")));
    await transition(d, "returnToCalculated", ctx.user.id, {}, String(fd.get("note") ?? "") || undefined);
    return done(d.id, "decl.msg.returned");
  } catch (e) {
    return handleError(e);
  }
}

/** Approves the declaration and generates all files. Pending legal validation requires an explicit acknowledgement. */
export async function approveDeclarationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("declarations.approve");
    const d = await loadDeclaration(ctx.company.id, String(fd.get("id")));
    if (d.legalPending && fd.get("acknowledgePending") !== "on") throw new UserError("errors.acknowledgeLegalPending");
    const raw = String(fd.get("fileLocale") ?? (await getLocale()));
    const fileLocale = isLocale(raw) ? raw : "nl";
    const approved = await transition(d, "approve", ctx.user.id, { approvedById: ctx.user.id, approvedAt: new Date(), legalAcknowledgedById: d.legalPending ? ctx.user.id : null });
    const t = await getTranslations({ locale: fileLocale });
    await generateFiles(approved, ctx.user.id, fileLocale, t as never);
    return done(d.id, "decl.msg.approved");
  } catch (e) {
    return handleError(e);
  }
}

export async function regenerateFilesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("declarations.approve");
    const d = await loadDeclaration(ctx.company.id, String(fd.get("id")));
    const raw = String(fd.get("fileLocale") ?? "nl");
    const fileLocale = isLocale(raw) ? raw : "nl";
    await generateFiles(d, ctx.user.id, fileLocale, (await getTranslations({ locale: fileLocale })) as never);
    return done(d.id, "decl.msg.generated");
  } catch (e) {
    return handleError(e);
  }
}

export async function revokeApprovalAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("declarations.approve");
    const d = await loadDeclaration(ctx.company.id, String(fd.get("id")));
    await transition(d, "revokeApproval", ctx.user.id, { approvedById: null, approvedAt: null });
    await db.declarationFile.deleteMany({ where: { declarationId: d.id } });
    return done(d.id, "decl.msg.revoked");
  } catch (e) {
    return handleError(e);
  }
}

const RECEIPT_MIME = new Set(["application/pdf", "image/png", "image/jpeg"]);

/** Records a submission made by the user through the official channel. ARA Payroll never submits itself. */
export async function recordSubmissionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("declarations.prepare");
    const d = await loadDeclaration(ctx.company.id, String(fd.get("id")));
    const data = z.object({ submittedAt: dateField, reference: z.string({ error: "validation.required" }).min(2).max(120) }).parse(formObject(fd));
    const extra: { receiptStorageKey?: string; receiptFileName?: string } = {};
    const file = fd.get("receipt");
    if (file instanceof File && file.size > 0) {
      if (file.size > 8 * 1024 * 1024) throw new UserError("errors.fileTooLarge");
      if (!RECEIPT_MIME.has(file.type)) throw new UserError("errors.receiptType");
      extra.receiptStorageKey = await storage.put(Buffer.from(await file.arrayBuffer()), ctx.company.id);
      extra.receiptFileName = file.name.replace(/[^\w.\- ()]/g, "_").slice(0, 150);
    }
    await transition(d, "recordSubmission", ctx.user.id, { submittedAt: data.submittedAt, submissionReference: data.reference, ...extra }, data.reference);
    return done(d.id, "decl.msg.submitted");
  } catch (e) {
    return handleError(e);
  }
}

export async function recordOutcomeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("declarations.prepare");
    const d = await loadDeclaration(ctx.company.id, String(fd.get("id")));
    const outcome = z.enum(["ACCEPTED", "REJECTED"]).parse(fd.get("outcome"));
    if (outcome === "ACCEPTED") {
      await transition(d, "recordAccepted", ctx.user.id, { acceptedAt: new Date() });
      return done(d.id, "decl.msg.accepted");
    }
    const reason = z.string({ error: "validation.required" }).min(3).max(500).parse(formObject(fd).reason);
    await transition(d, "recordRejected", ctx.user.id, { rejectedAt: new Date(), rejectionReason: reason }, reason);
    return done(d.id, "decl.msg.rejected");
  } catch (e) {
    return handleError(e);
  }
}

export async function recordPaymentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("declarations.prepare");
    const d = await loadDeclaration(ctx.company.id, String(fd.get("id")));
    const data = z.object({ paidAt: dateField, reference: z.string().max(120).optional() }).parse(formObject(fd));
    await transition(d, "recordPayment", ctx.user.id, { paidAt: data.paidAt, paymentReference: data.reference ?? null }, data.reference);
    return done(d.id, "decl.msg.paid");
  } catch (e) {
    return handleError(e);
  }
}

export async function createSupplementaryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const ctx = await requirePermission("declarations.prepare");
    const d = await loadDeclaration(ctx.company.id, String(fd.get("id")));
    id = (await createSupplementary(d, ctx.user.id)).id;
  } catch (e) {
    return handleError(e);
  }
  redirect(path(id));
}

export async function prepareDeclarationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const ctx = await requirePermission("declarations.prepare");
    const data = z.object({ year: z.coerce.number().int().min(2000).max(2100), month: z.coerce.number().int().min(0).max(12) }).parse(formObject(fd));
    if (data.month === 0) id = (await prepareAnnualDeclaration(ctx.company.id, data.year, ctx.user.id)).id;
    else {
      const r = await prepareMonthlyDeclaration(ctx.company.id, data.year, data.month, ctx.user.id);
      id = r.declaration.id;
    }
  } catch (e) {
    return handleError(e);
  }
  redirect(path(id));
}

export async function markNotificationsReadAction(): Promise<ActionState> {
  try {
    const ctx = await requirePermission("tax.view");
    await db.notification.updateMany({ where: { companyId: ctx.company.id, readAt: null, NOT: { type: { startsWith: "subscription." } } }, data: { readAt: new Date() } });
    revalidatePath("/app/tax");
    return null;
  } catch (e) {
    return handleError(e);
  }
}
