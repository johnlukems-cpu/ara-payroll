"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { AuthError, getContext } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { setActiveCompany } from "@/lib/server/session";
import { formObject, handleError, ok, UserError, type ActionState } from "@/lib/server/action";
import { assertActiveCurrency } from "@/lib/server/rates";
import { parseMoney } from "@/lib/format";
import {
  approveRegistration, cancelSubscription, changePlan, convertRequest, convertTrial, createSubscription, createSubscriptionInvoice, creditInvoice,
  endSupportAccess, extendTrial, isSaasAdmin, isSuperAdmin, processSubscriptions, recordPayment, renewSubscription, resumeSubscription,
  saveSaasSettings, setAgreedPrice, setCapacity, setDiscount, startSupportAccess, suspendSubscription,
} from "@/lib/server/saas";

/** Server-side authorisation for the ARA administration portal. */
async function requireAdmin(level: "SAAS" | "SUPER" = "SAAS") {
  const ctx = await getContext();
  if (!ctx) throw new AuthError("errors.unauthenticated");
  if (!(level === "SUPER" ? isSuperAdmin(ctx.user) : isSaasAdmin(ctx.user))) throw new AuthError("errors.forbidden");
  return ctx;
}

const done = async (key: string, values?: Record<string, string | number>) => {
  revalidatePath("/admin", "layout");
  return ok((await getTranslations())(key as never, values as never));
};
const id = (fd: FormData, k = "id") => z.string().min(1).parse(fd.get(k));
const reason = z.string({ error: "validation.required" }).trim().min(3, "validation.required").max(500);
const money = (v?: string) => {
  try { const n = parseMoney(v); if (n < 0) throw new Error(); return n; } catch { throw new UserError("validation.amount"); }
};
const optionalMoney = (v?: string) => (v ? money(v) : null);
const pct = (v?: string) => {
  const n = v ? Number(v.replace(",", ".")) : 0;
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new UserError("validation.percent");
  return Math.round(n * 100);
};

// ---------------------------------------------------------------------------------------------- customers

const customerSchema = z.object({
  name: z.string({ error: "validation.required" }).trim().min(2).max(160),
  registrationNumber: z.string().max(60).optional(),
  contactName: z.string().max(120).optional(),
  contactEmail: z.email("validation.email").optional(),
  phone: z.string().max(40).optional(),
  address: z.string().max(200).optional(),
  country: z.string().max(80).optional(),
  status: z.enum(["NEW_REQUEST", "IN_REVIEW", "ACTIVE", "TRIAL", "PAYMENT_DUE", "SUSPENDED", "CANCELLED"]),
  notes: z.string().max(2000).optional(),
});

export async function updateCustomerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireAdmin();
    const orgId = id(fd);
    const d = customerSchema.parse(formObject(fd));
    const before = await db.organization.findUnique({ where: { id: orgId } });
    if (!before) throw new UserError("errors.notFound");
    await db.organization.update({ where: { id: orgId }, data: { ...d, registrationNumber: d.registrationNumber ?? null, contactName: d.contactName ?? null, contactEmail: d.contactEmail ?? null, phone: d.phone ?? null, address: d.address ?? null, country: d.country || "Suriname", notes: d.notes ?? null } });
    await audit({ companyId: null, userId: ctx.user.id, action: "customer.updated", entity: "Organization", entityId: orgId, details: { statusBefore: before.status, statusAfter: d.status } });
    return done("saas.msg.customerSaved");
  } catch (e) {
    return handleError(e);
  }
}

export async function assignPlanAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireAdmin();
    const orgId = id(fd);
    const d = z.object({ plan: z.string().min(1), cycle: z.enum(["MONTHLY", "YEARLY"]), trial: z.string().optional() }).parse(formObject(fd));
    const plan = await db.plan.findUnique({ where: { code: d.plan } });
    if (!plan || !plan.isActive) throw new UserError("saasErrors.planInactive");
    const current = await db.subscription.findFirst({ where: { organizationId: orgId, status: { in: ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED"] } } });
    if (current) throw new UserError("saasErrors.alreadySubscribed");
    await db.$transaction((tx) => createSubscription(tx, orgId, plan, { trial: d.trial === "on", cycle: d.cycle, userId: ctx.user.id }));
    return done("saas.msg.planAssigned", { plan: plan.nameNl });
  } catch (e) {
    return handleError(e);
  }
}

/** All subscription changes go through one action so every change is authorised and logged in the same way. */
export async function subscriptionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireAdmin();
    const subId = id(fd);
    const raw = formObject(fd);
    const uid = ctx.user.id;
    switch (raw.op) {
      case "changePlan": await changePlan(subId, z.string().min(1).parse(raw.plan), uid); break;
      case "renew": await renewSubscription(subId, uid); break;
      case "suspend": await suspendSubscription(subId, uid, reason.parse(raw.reason)); break;
      case "resume": await resumeSubscription(subId, uid); break;
      case "cancel": await cancelSubscription(subId, uid, reason.parse(raw.reason), raw.endDate ? new Date(`${raw.endDate}T00:00:00Z`) : new Date()); break;
      case "extendTrial": await extendTrial(subId, uid, z.coerce.number().int().min(1).max(365).parse(raw.days)); break;
      case "convertTrial": await convertTrial(subId, uid, z.enum(["MONTHLY", "YEARLY"]).parse(raw.cycle)); break;
      case "capacity": await setCapacity(subId, uid, z.coerce.number().int().min(0).max(100000).parse(raw.extra)); break;
      case "discount": await setDiscount(subId, uid, pct(raw.discount), raw.note ?? null); break;
      case "price": await setAgreedPrice(subId, uid, optionalMoney(raw.monthly), optionalMoney(raw.yearly)); break;
      case "invoice": await createSubscriptionInvoice(subId, uid); break;
      default: throw new UserError("validation.invalid");
    }
    return done(`saas.msg.sub.${raw.op}`);
  } catch (e) {
    return handleError(e);
  }
}

// ---------------------------------------------------------------------------------------------- billing

export async function recordPaymentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireAdmin();
    const raw = formObject(fd);
    const d = z.object({ method: z.string().min(1), paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "validation.date"), reference: z.string().max(120).optional(), note: z.string().max(500).optional() }).parse(raw);
    await recordPayment(id(fd), ctx.user.id, { amount: money(raw.amount), paidAt: new Date(`${d.paidAt}T12:00:00Z`), methodCode: d.method, reference: d.reference ?? null, note: d.note ?? null });
    return done("saas.msg.paymentRecorded");
  } catch (e) {
    return handleError(e);
  }
}

export async function creditInvoiceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireAdmin();
    const raw = formObject(fd);
    await creditInvoice(id(fd), ctx.user.id, optionalMoney(raw.amount), reason.parse(raw.reason));
    return done("saas.msg.credited");
  } catch (e) {
    return handleError(e);
  }
}

// ---------------------------------------------------------------------------------------------- requests

export async function requestAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let redirectTo: string | null = null;
  try {
    const ctx = await requireAdmin();
    const raw = formObject(fd);
    const reqId = id(fd);
    const r = await db.contactRequest.findUnique({ where: { id: reqId } });
    if (!r) throw new UserError("errors.notFound");
    const decided = { decidedAt: new Date(), decidedById: ctx.user.id };
    switch (raw.op) {
      case "review": await db.contactRequest.update({ where: { id: r.id }, data: { status: "IN_REVIEW" } }); break;
      case "reject": await db.contactRequest.update({ where: { id: r.id }, data: { status: "REJECTED", handled: true, adminNote: reason.parse(raw.note), passwordHash: null, ...decided } }); break;
      case "info": await db.contactRequest.update({ where: { id: r.id }, data: { status: "INFO_REQUESTED", adminNote: reason.parse(raw.note) } }); break;
      case "demo": {
        const at = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "validation.date").parse(raw.demoAt);
        await db.contactRequest.update({ where: { id: r.id }, data: { status: "DEMO_SCHEDULED", demoAt: new Date(`${at}:00`), adminNote: raw.note ?? r.adminNote } });
        break;
      }
      case "approve": {
        if (r.type === "REGISTRATION") {
          const res = await approveRegistration(r.id, ctx.user.id);
          redirectTo = `/admin/customers/${res.org.id}?approved=1`;
        } else {
          await db.contactRequest.update({ where: { id: r.id }, data: { status: "APPROVED", handled: true, ...decided } });
        }
        break;
      }
      case "convert": {
        const d = z.object({ organizationName: z.string().trim().min(2).max(160), companyName: z.string().trim().min(2).max(160), currency: z.string().regex(/^[A-Z]{3}$/), plan: z.string().min(1), trial: z.string().optional() }).parse(raw);
        if (!(await assertActiveCurrency(d.currency))) throw new UserError("errors.currencyInactive", { code: d.currency });
        const res = await convertRequest(r.id, ctx.user.id, { organizationName: d.organizationName, companyName: d.companyName, currency: d.currency, planCode: d.plan, trial: d.trial === "on" });
        const t = await getTranslations();
        revalidatePath("/admin", "layout");
        return ok(res.temporaryPassword ? t("saas.msg.convertedWithPassword", { email: res.user.email, password: res.temporaryPassword }) : t("saas.msg.convertedExisting", { email: res.user.email }));
      }
      default: throw new UserError("validation.invalid");
    }
    await audit({ companyId: null, userId: ctx.user.id, action: `request.${raw.op}`, entity: "ContactRequest", entityId: r.id, details: { type: r.type, email: r.email } });
    if (!redirectTo) return done(`saas.msg.request.${raw.op}`);
  } catch (e) {
    return handleError(e);
  }
  redirect(redirectTo!);
}

// ---------------------------------------------------------------------------------------------- plans

const lines = (v?: string) => (v ?? "").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 20);

export async function savePlanAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let createdId: string | null = null;
  try {
    const ctx = await requireAdmin();
    const raw = formObject(fd);
    const d = z.object({
      code: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,30}$/, "validation.code"),
      nameNl: z.string().trim().min(2).max(60), nameEn: z.string().trim().min(2).max(60),
      descriptionNl: z.string().max(300).optional(), descriptionEn: z.string().max(300).optional(),
      currency: z.string().regex(/^[A-Z]{3}$/, "validation.currency"),
      minEmployees: z.coerce.number().int().min(0).max(100000).optional(), maxEmployees: z.coerce.number().int().min(1).max(100000).optional(),
      trialDays: z.coerce.number().int().min(0).max(365), sortOrder: z.coerce.number().int().min(0).max(1000),
    }).parse(raw);
    if (!(await assertActiveCurrency(d.currency))) throw new UserError("errors.currencyInactive", { code: d.currency });
    const data = {
      ...d, descriptionNl: d.descriptionNl ?? null, descriptionEn: d.descriptionEn ?? null, minEmployees: d.minEmployees ?? null, maxEmployees: d.maxEmployees ?? null,
      monthlyPrice: optionalMoney(raw.monthlyPrice), yearlyPrice: optionalMoney(raw.yearlyPrice), discountBp: pct(raw.discount),
      modules: lines(raw.modules), featuresNl: lines(raw.featuresNl), featuresEn: lines(raw.featuresEn),
      isActive: raw.isActive === "on", isPublished: raw.isPublished === "on", popular: raw.popular === "on",
    };
    // Price changes apply to new subscriptions only: existing contracts keep their agreed terms.
    if (raw.id) {
      const before = await db.plan.findUnique({ where: { id: raw.id } });
      if (!before) throw new UserError("errors.notFound");
      await db.plan.update({ where: { id: raw.id }, data });
      await audit({ companyId: null, userId: ctx.user.id, action: "plan.updated", entity: "Plan", entityId: raw.id, details: { code: data.code, monthlyBefore: before.monthlyPrice, monthlyAfter: data.monthlyPrice, yearlyBefore: before.yearlyPrice, yearlyAfter: data.yearlyPrice } });
      if (data.popular) await db.plan.updateMany({ where: { id: { not: raw.id } }, data: { popular: false } });
      revalidatePath("/", "layout");
      return done("saas.msg.planSaved");
    }
    createdId = (await db.plan.create({ data })).id;
    if (data.popular) await db.plan.updateMany({ where: { id: { not: createdId } }, data: { popular: false } });
    await audit({ companyId: null, userId: ctx.user.id, action: "plan.created", entity: "Plan", entityId: createdId, details: { code: data.code } });
    revalidatePath("/", "layout");
  } catch (e) {
    return handleError(e);
  }
  redirect(`/admin/plans/${createdId}?created=1`);
}

// ---------------------------------------------------------------------------------------------- settings & users

export async function saveSaasSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireAdmin("SUPER");
    const d = z.object({
      registrationMode: z.enum(["APPROVAL", "INSTANT"]), invoicePrefix: z.string().trim().regex(/^[A-Z0-9]{2,8}$/, "validation.code"),
      paymentTermDays: z.coerce.number().int().min(0).max(120), trialReminderDays: z.coerce.number().int().min(1).max(60),
      sellerDetails: z.string().max(600).optional(), paymentInstructions: z.string().max(600).optional(),
    }).parse(formObject(fd));
    await saveSaasSettings({ ...d, sellerDetails: d.sellerDetails ?? "", paymentInstructions: d.paymentInstructions ?? "" });
    await audit({ companyId: null, userId: ctx.user.id, action: "platform.settings_saved", entity: "PlatformSetting", entityId: "saas", details: d });
    return done("saas.msg.settingsSaved");
  } catch (e) {
    return handleError(e);
  }
}

export async function savePaymentMethodAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireAdmin("SUPER");
    const d = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,30}$/, "validation.code"), nameNl: z.string().trim().min(2).max(60), nameEn: z.string().trim().min(2).max(60), instructions: z.string().max(500).optional() }).parse(formObject(fd));
    const isActive = fd.get("isActive") === "on";
    await db.paymentMethod.upsert({ where: { code: d.code }, create: { ...d, instructions: d.instructions ?? null, isActive }, update: { nameNl: d.nameNl, nameEn: d.nameEn, instructions: d.instructions ?? null, isActive } });
    await audit({ companyId: null, userId: ctx.user.id, action: "platform.payment_method_saved", entity: "PaymentMethod", entityId: d.code, details: { isActive } });
    return done("saas.msg.methodSaved");
  } catch (e) {
    return handleError(e);
  }
}

export async function setPlatformRoleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireAdmin("SUPER");
    const d = z.object({ email: z.email("validation.email").transform((v) => v.toLowerCase()), role: z.enum(["SUPER_ADMIN", "SAAS_ADMIN", "NONE"]) }).parse(formObject(fd));
    const user = await db.user.findUnique({ where: { email: d.email } });
    if (!user) throw new UserError("saasErrors.userNotFound");
    if (user.id === ctx.user.id && d.role !== "SUPER_ADMIN") throw new UserError("saasErrors.ownRole");
    await db.user.update({ where: { id: user.id }, data: { platformRole: d.role === "NONE" ? null : d.role, isPlatformAdmin: d.role === "SUPER_ADMIN" } });
    await audit({ companyId: null, userId: ctx.user.id, action: "platform.role_changed", entity: "User", entityId: user.id, details: { email: user.email, role: d.role } });
    return done("saas.msg.roleSaved");
  } catch (e) {
    return handleError(e);
  }
}

export async function runProcessingAction(): Promise<ActionState> {
  try {
    const ctx = await requireAdmin();
    const r = await processSubscriptions();
    await audit({ companyId: null, userId: ctx.user.id, action: "platform.subscriptions_processed", entity: "Subscription", details: r });
    return done("saas.msg.processed", r);
  } catch (e) {
    return handleError(e);
  }
}

// ---------------------------------------------------------------------------------------------- support access

export async function startSupportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let companyId: string;
  try {
    const ctx = await requireAdmin("SUPER");
    const raw = formObject(fd);
    const access = await startSupportAccess(ctx.user, z.string().min(1).parse(raw.companyId), raw.reason ?? "", z.coerce.number().min(1).max(8).parse(raw.hours ?? "1"));
    await setActiveCompany(ctx.session.id, access.companyId);
    companyId = access.companyId;
  } catch (e) {
    return handleError(e);
  }
  void companyId;
  redirect("/app");
}

export async function endSupportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireAdmin("SUPER");
    await endSupportAccess(ctx.user, id(fd));
    return done("saas.msg.supportEnded");
  } catch (e) {
    return handleError(e);
  }
}

/** Form action from the support banner in the customer application. */
export async function endSupportFromAppAction(fd: FormData) {
  const ctx = await getContext();
  if (ctx && isSuperAdmin(ctx.user)) await endSupportAccess(ctx.user, String(fd.get("id") ?? ""));
  redirect("/admin/support");
}
