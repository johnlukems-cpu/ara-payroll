import "server-only";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { BillingCycle, Plan, Prisma, Subscription, User } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "./audit";
import { UserError } from "./errors";
import { seedCompanyDefaults } from "./company-setup";
import { addCycle, addDays, cyclePrice, invoiceAmounts, invoiceNumber, isOverdue, statusAfterPayment } from "@/lib/saas";
import type { Locale } from "@/i18n/config";

type Tx = Prisma.TransactionClient;

// ---------------------------------------------------------------------------------------------------------------
// Platform roles
// ---------------------------------------------------------------------------------------------------------------

/** Super administrator of ARA Intelligent Solutions (legacy isPlatformAdmin counts as super administrator). */
export const isSuperAdmin = (u: Pick<User, "platformRole" | "isPlatformAdmin"> | null | undefined) => !!u && (u.platformRole === "SUPER_ADMIN" || u.isPlatformAdmin);
/** Super or SaaS administrator: may manage customers, subscriptions, invoices and payments. */
export const isSaasAdmin = (u: Pick<User, "platformRole" | "isPlatformAdmin"> | null | undefined) => !!u && (isSuperAdmin(u) || u.platformRole === "SAAS_ADMIN");

// ---------------------------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------------------------

/** sellerDetails / paymentInstructions: free text printed on invoices, entered by the super administrator (never invented). */
export type SaasSettings = { registrationMode: "APPROVAL" | "INSTANT"; invoicePrefix: string; paymentTermDays: number; trialReminderDays: number; sellerDetails: string; paymentInstructions: string };
const DEFAULTS: SaasSettings = { registrationMode: "APPROVAL", invoicePrefix: "ARA", paymentTermDays: 14, trialReminderDays: 7, sellerDetails: "", paymentInstructions: "" };

export async function saasSettings(): Promise<SaasSettings> {
  const row = await db.platformSetting.findUnique({ where: { key: "saas" } });
  return { ...DEFAULTS, ...((row?.value as Partial<SaasSettings> | null) ?? {}) };
}

export async function saveSaasSettings(value: SaasSettings) {
  await db.platformSetting.upsert({ where: { key: "saas" }, create: { key: "saas", value }, update: { value } });
}

// ---------------------------------------------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------------------------------------------

/** The customer's current subscription (most recent). */
export const currentSubscription = (organizationId: string, client: Tx | typeof db = db) =>
  client.subscription.findFirst({ where: { organizationId }, orderBy: { createdAt: "desc" }, include: { plan: true } });

const terms = (s: Pick<Subscription, "planId" | "status" | "billingCycle" | "priceMonthly" | "priceYearly" | "currency" | "maxEmployees" | "extraEmployees" | "discountBp" | "trialEnd" | "nextInvoiceDate">) => ({
  planId: s.planId, status: s.status, billingCycle: s.billingCycle, priceMonthly: s.priceMonthly, priceYearly: s.priceYearly, currency: s.currency,
  maxEmployees: s.maxEmployees, extraEmployees: s.extraEmployees, discountBp: s.discountBp, trialEnd: s.trialEnd?.toISOString() ?? null, nextInvoiceDate: s.nextInvoiceDate?.toISOString() ?? null,
});

async function event(tx: Tx, sub: Subscription, type: string, userId: string | null, details: Record<string, unknown>) {
  await tx.subscriptionEvent.create({ data: { subscriptionId: sub.id, type, userId, details: details as Prisma.InputJsonValue } });
  await tx.auditLog.create({ data: { companyId: null, userId, action: `subscription.${type.toLowerCase()}`, entity: "Organization", entityId: sub.organizationId, details: { subscriptionId: sub.id, ...details } as Prisma.InputJsonValue } });
}

/** New subscription with the plan's current price as agreed contract terms; starts with the plan's trial when requested. */
export async function createSubscription(tx: Tx, organizationId: string, plan: Plan, opts: { trial: boolean; cycle?: BillingCycle; userId: string | null; now?: Date }) {
  const now = opts.now ?? new Date();
  const trial = opts.trial && plan.trialDays > 0;
  const trialEnd = trial ? addDays(now, plan.trialDays) : null;
  const sub = await tx.subscription.create({
    data: {
      organizationId, planId: plan.id, status: trial ? "TRIAL" : "ACTIVE", billingCycle: opts.cycle ?? "MONTHLY",
      priceMonthly: plan.monthlyPrice, priceYearly: plan.yearlyPrice, currency: plan.currency, maxEmployees: plan.maxEmployees, discountBp: plan.discountBp,
      trialStart: trial ? now : null, trialEnd, startDate: now, nextInvoiceDate: trialEnd ?? now,
    },
  });
  await tx.organization.update({ where: { id: organizationId }, data: { status: trial ? "TRIAL" : "ACTIVE" } });
  await event(tx, sub, "ASSIGNED", opts.userId, { plan: plan.code, after: terms(sub) });
  return sub;
}

async function loadSub(id: string) {
  const sub = await db.subscription.findUnique({ where: { id }, include: { plan: true } });
  if (!sub) throw new UserError("errors.notFound");
  return sub;
}

/** Upgrade or downgrade: the new plan's current price becomes the agreed price; earlier terms stay in the history. */
export async function changePlan(subscriptionId: string, planCode: string, userId: string) {
  const sub = await loadSub(subscriptionId);
  const plan = await db.plan.findUnique({ where: { code: planCode } });
  if (!plan || !plan.isActive) throw new UserError("saasErrors.planInactive");
  if (plan.id === sub.planId) throw new UserError("saasErrors.samePlan");
  if (!LIVE.includes(sub.status)) throw new UserError("saasErrors.invalidTransition");
  const type = plan.sortOrder > sub.plan.sortOrder ? "UPGRADED" : "DOWNGRADED";
  return db.$transaction(async (tx) => {
    const updated = await tx.subscription.update({ where: { id: sub.id }, data: { planId: plan.id, priceMonthly: plan.monthlyPrice, priceYearly: plan.yearlyPrice, currency: plan.currency, maxEmployees: plan.maxEmployees } });
    await event(tx, updated, type, userId, { from: sub.plan.code, to: plan.code, before: terms(sub), after: terms(updated) });
    return updated;
  });
}

/** Subscriptions that are still running (can be changed, suspended or ended). */
const LIVE: Subscription["status"][] = ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED"];

type Change = { status?: Subscription["status"]; data: Prisma.SubscriptionUpdateInput; type: string; customer?: Prisma.OrganizationUpdateInput; details?: Record<string, unknown> };

async function apply(subscriptionId: string, userId: string, build: (s: Awaited<ReturnType<typeof loadSub>>) => Change) {
  const sub = await loadSub(subscriptionId);
  const c = build(sub);
  return db.$transaction(async (tx) => {
    const updated = await tx.subscription.update({ where: { id: sub.id }, data: c.data });
    if (c.customer) await tx.organization.update({ where: { id: sub.organizationId }, data: c.customer });
    await event(tx, updated, c.type, userId, { ...(c.details ?? {}), before: terms(sub), after: terms(updated) });
    return updated;
  });
}

export const renewSubscription = (id: string, userId: string, now = new Date()) =>
  apply(id, userId, (s) => {
    if (s.status === "TRIAL") throw new UserError("saasErrors.useTrialActions");
    return { type: "RENEWED", data: { status: "ACTIVE", endDate: null, cancelledAt: null, cancelReason: null, suspendedAt: null, nextInvoiceDate: s.nextInvoiceDate && s.nextInvoiceDate > now ? s.nextInvoiceDate : now }, customer: { status: "ACTIVE" } };
  });

export const suspendSubscription = (id: string, userId: string, reason: string) =>
  apply(id, userId, (s) => {
    if (!["TRIAL", "ACTIVE", "PAST_DUE"].includes(s.status)) throw new UserError("saasErrors.invalidTransition");
    return { type: "SUSPENDED", data: { status: "SUSPENDED", suspendedAt: new Date() }, customer: { status: "SUSPENDED" }, details: { reason } };
  });

export const resumeSubscription = (id: string, userId: string) =>
  apply(id, userId, (s) => {
    if (s.status !== "SUSPENDED") throw new UserError("saasErrors.notSuspended");
    // Back to the trial when the subscription was suspended during a trial that has not ended yet.
    const trialRunning = !!s.trialEnd && s.trialEnd > new Date() && !!s.trialStart && s.nextInvoiceDate?.getTime() === s.trialEnd.getTime();
    return { type: "RESUMED", data: { status: trialRunning ? "TRIAL" : "ACTIVE", suspendedAt: null }, customer: { status: trialRunning ? "TRIAL" : "ACTIVE" } };
  });

/**
 * Cancellation per a date (default today); access ends on that date. With a future end date the customer keeps
 * access (with a warning) until then; the customer status becomes CANCELLED when the end date is reached.
 */
export const cancelSubscription = (id: string, userId: string, reason: string, endDate = new Date(), now = new Date()) =>
  apply(id, userId, (s) => {
    if (!LIVE.includes(s.status)) throw new UserError("saasErrors.invalidTransition");
    return { type: "CANCELLED", data: { status: "CANCELLED", cancelledAt: now, cancelReason: reason, endDate, nextInvoiceDate: null }, ...(endDate <= now ? { customer: { status: "CANCELLED" as const } } : {}), details: { reason, endDate: endDate.toISOString() } };
  });

export const extendTrial = (id: string, userId: string, days: number) =>
  apply(id, userId, (s) => {
    if (s.status !== "TRIAL" && s.status !== "EXPIRED") throw new UserError("saasErrors.noTrial");
    const base = s.trialEnd && s.trialEnd > new Date() ? s.trialEnd : new Date();
    const trialEnd = addDays(base, days);
    return { type: "TRIAL_EXTENDED", data: { status: "TRIAL", trialEnd, nextInvoiceDate: trialEnd, trialReminderAt: null }, customer: { status: "TRIAL" }, details: { days } };
  });

export const convertTrial = (id: string, userId: string, cycle: BillingCycle, now = new Date()) =>
  apply(id, userId, (s) => {
    if (s.status !== "TRIAL" && s.status !== "EXPIRED") throw new UserError("saasErrors.noTrial");
    if (cyclePrice({ billingCycle: cycle, priceMonthly: s.priceMonthly, priceYearly: s.priceYearly }) == null) throw new UserError("saasErrors.noPriceForCycle");
    return { type: "TRIAL_CONVERTED", data: { status: "ACTIVE", billingCycle: cycle, trialEnd: s.trialEnd && s.trialEnd < now ? s.trialEnd : now, nextInvoiceDate: now }, customer: { status: "ACTIVE" }, details: { cycle } };
  });

export const setCapacity = (id: string, userId: string, extraEmployees: number) =>
  apply(id, userId, () => ({ type: "CAPACITY_CHANGED", data: { extraEmployees }, details: { extraEmployees } }));

export const setDiscount = (id: string, userId: string, discountBp: number, note: string | null) =>
  apply(id, userId, () => ({ type: "DISCOUNT_CHANGED", data: { discountBp, discountNote: note }, details: { discountBp, note } }));

/** Agreed price for a customer (e.g. Enterprise "price on request"). */
export const setAgreedPrice = (id: string, userId: string, priceMonthly: number | null, priceYearly: number | null) =>
  apply(id, userId, () => ({ type: "PRICE_AGREED", data: { priceMonthly, priceYearly }, details: { priceMonthly, priceYearly } }));

// ---------------------------------------------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------------------------------------------

type NewCustomer = {
  organizationName: string; companyName: string; currency: string; locale: Locale;
  owner: { name: string; email: string; passwordHash: string };
  contact?: { phone?: string | null; registrationNumber?: string | null; address?: string | null; country?: string | null };
  planCode: string; trial: boolean; userId: string | null;
};

/** Creates organisation, first company (with Surinamese defaults), owner account and subscription in one transaction. */
export async function createCustomer(c: NewCustomer) {
  const plan = await db.plan.findUnique({ where: { code: c.planCode } });
  if (!plan || !plan.isActive) throw new UserError("saasErrors.planInactive");
  return db.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email: c.owner.email } });
    const user = existing ?? (await tx.user.create({ data: { email: c.owner.email, name: c.owner.name, passwordHash: c.owner.passwordHash, locale: c.locale } }));
    const org = await tx.organization.create({
      data: {
        name: c.organizationName, contactName: c.owner.name, contactEmail: c.owner.email, phone: c.contact?.phone ?? null,
        registrationNumber: c.contact?.registrationNumber ?? null, address: c.contact?.address ?? null, country: c.contact?.country || "Suriname", status: "ACTIVE",
      },
    });
    const company = await tx.company.create({ data: { name: c.companyName, organizationId: org.id, currency: c.currency } });
    await tx.membership.create({ data: { userId: user.id, companyId: company.id, role: "OWNER" } });
    await seedCompanyDefaults(tx, company.id, c.locale);
    const subscription = await createSubscription(tx, org.id, plan, { trial: c.trial, userId: c.userId });
    await tx.auditLog.create({ data: { companyId: null, userId: c.userId, action: "customer.created", entity: "Organization", entityId: org.id, details: { company: company.id, owner: user.email, plan: plan.code, existingUser: !!existing } } });
    return { org, company, user, subscription, existingUser: !!existing };
  }, { timeout: 30_000 });
}

/** Approves a website registration: the account is created with the password the applicant chose. */
export async function approveRegistration(requestId: string, adminId: string) {
  const r = await db.contactRequest.findUnique({ where: { id: requestId } });
  if (!r || r.type !== "REGISTRATION") throw new UserError("errors.notFound");
  if (r.status === "CONVERTED" || r.status === "REJECTED") throw new UserError("saasErrors.requestClosed");
  if (!r.passwordHash || !r.organizationName || !r.currency) throw new UserError("saasErrors.requestIncomplete");
  if (await db.user.findUnique({ where: { email: r.email } })) throw new UserError("saasErrors.emailExists");
  const res = await createCustomer({
    organizationName: r.organizationName, companyName: r.company, currency: r.currency, locale: r.locale === "en" ? "en" : "nl",
    owner: { name: r.name, email: r.email, passwordHash: r.passwordHash }, contact: { phone: r.phone }, planCode: r.plan ?? "starter", trial: true, userId: adminId,
  });
  await db.contactRequest.update({ where: { id: r.id }, data: { status: "CONVERTED", handled: true, decidedAt: new Date(), decidedById: adminId, organizationId: res.org.id, passwordHash: null } });
  return res;
}

/** Converts a demo or quote request into a customer; the owner receives a one-time temporary password. */
export async function convertRequest(requestId: string, adminId: string, input: { companyName: string; organizationName: string; currency: string; planCode: string; trial: boolean }) {
  const r = await db.contactRequest.findUnique({ where: { id: requestId } });
  if (!r) throw new UserError("errors.notFound");
  if (r.status === "CONVERTED" || r.status === "REJECTED") throw new UserError("saasErrors.requestClosed");
  const temporaryPassword = `Ara-${randomBytes(6).toString("base64url")}9`;
  const res = await createCustomer({
    organizationName: input.organizationName, companyName: input.companyName, currency: input.currency, locale: r.locale === "en" ? "en" : "nl",
    owner: { name: r.name, email: r.email, passwordHash: await bcrypt.hash(temporaryPassword, 12) }, contact: { phone: r.phone }, planCode: input.planCode, trial: input.trial, userId: adminId,
  });
  await db.contactRequest.update({ where: { id: r.id }, data: { status: "CONVERTED", handled: true, decidedAt: new Date(), decidedById: adminId, organizationId: res.org.id, passwordHash: null } });
  return { ...res, temporaryPassword: res.existingUser ? null : temporaryPassword };
}

// ---------------------------------------------------------------------------------------------------------------
// Invoices and payments
// ---------------------------------------------------------------------------------------------------------------

async function nextNumber(tx: Tx, year: number, prefix: string) {
  const series = `${prefix}-${year}`;
  const c = await tx.invoiceCounter.upsert({ where: { series }, create: { series, last: 1 }, update: { last: { increment: 1 } } });
  return invoiceNumber(prefix, year, c.last);
}

/** Invoice for the next billing period under the agreed terms; moves the next invoice date one cycle forward. */
export async function createSubscriptionInvoice(subscriptionId: string, userId: string, now = new Date()) {
  const sub = await loadSub(subscriptionId);
  if (sub.status === "CANCELLED" || sub.status === "EXPIRED" || sub.status === "SUSPENDED") throw new UserError("saasErrors.notBillable");
  if (sub.status === "TRIAL") throw new UserError("saasErrors.trialNotBillable");
  const price = cyclePrice(sub);
  if (price == null) throw new UserError("saasErrors.noPriceForCycle");
  const settings = await saasSettings();
  const start = sub.nextInvoiceDate ?? now;
  const end = addDays(addCycle(start, sub.billingCycle), -1);
  const amounts = invoiceAmounts(price, sub.discountBp);
  return db.$transaction(async (tx) => {
    const number = await nextNumber(tx, now.getUTCFullYear(), settings.invoicePrefix);
    const invoice = await tx.invoice.create({
      data: {
        number, organizationId: sub.organizationId, subscriptionId: sub.id, issueDate: now, dueDate: addDays(now, settings.paymentTermDays),
        periodStart: start, periodEnd: end, currency: sub.currency, ...amounts, createdById: userId,
        lines: [{ description: `ARA Payroll ${sub.plan.nameNl} — ${sub.billingCycle === "YEARLY" ? "jaarabonnement" : "maandabonnement"}`, quantity: 1, unitPrice: price, amount: price }] as Prisma.InputJsonValue,
        notes: sub.discountBp ? `Korting ${sub.discountBp / 100}%${sub.discountNote ? ` — ${sub.discountNote}` : ""}` : null,
      },
    });
    await tx.subscription.update({ where: { id: sub.id }, data: { nextInvoiceDate: addCycle(start, sub.billingCycle) } });
    await tx.auditLog.create({ data: { companyId: null, userId, action: "invoice.created", entity: "Organization", entityId: sub.organizationId, details: { invoice: number, total: amounts.total, currency: sub.currency } } });
    return invoice;
  });
}

/** Credit note for (part of) an invoice. */
export async function creditInvoice(invoiceId: string, userId: string, amount: number | null, reason: string, now = new Date()) {
  const inv = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv || inv.kind !== "INVOICE") throw new UserError("errors.notFound");
  if (inv.status === "CREDITED" || inv.status === "VOID") throw new UserError("saasErrors.alreadyCredited");
  const credited = (await db.invoice.aggregate({ where: { creditForId: inv.id }, _sum: { total: true } }))._sum.total ?? 0;
  // Only the unpaid part can be credited: refunds of received payments are outside this application.
  const creditable = inv.total + credited - inv.amountPaid; // credited is negative
  const value = amount ?? creditable;
  if (value <= 0 || value > creditable) throw new UserError("saasErrors.invalidCredit");
  const settings = await saasSettings();
  return db.$transaction(async (tx) => {
    const number = await nextNumber(tx, now.getUTCFullYear(), `${settings.invoicePrefix}-CN`);
    const note = await tx.invoice.create({
      data: {
        number, kind: "CREDIT_NOTE", creditForId: inv.id, organizationId: inv.organizationId, subscriptionId: inv.subscriptionId, issueDate: now, dueDate: now,
        currency: inv.currency, subtotal: -value, total: -value, status: "PAID", amountPaid: 0, createdById: userId,
        lines: [{ description: `Creditnota voor ${inv.number}: ${reason}`, quantity: 1, unitPrice: -value, amount: -value }] as Prisma.InputJsonValue, notes: reason,
      },
    });
    // Once nothing is outstanding any more the invoice is closed: CREDITED when nothing was paid, otherwise PAID.
    const outstanding = creditable - value;
    if (outstanding <= 0) await tx.invoice.update({ where: { id: inv.id }, data: { status: inv.amountPaid > 0 ? "PAID" : "CREDITED" } });
    await tx.auditLog.create({ data: { companyId: null, userId, action: "invoice.credited", entity: "Organization", entityId: inv.organizationId, details: { invoice: inv.number, creditNote: number, amount: value, reason } } });
    return note;
  });
}

/**
 * Registers a payment an administrator has confirmed (bank statement, receipt). Never created automatically:
 * ARA Payroll has no payment-provider integration.
 */
export async function recordPayment(invoiceId: string, userId: string, p: { amount: number; paidAt: Date; methodCode: string; reference: string | null; note: string | null }, now = new Date()) {
  const inv = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv || inv.kind !== "INVOICE") throw new UserError("errors.notFound");
  if (inv.status === "PAID" || inv.status === "CREDITED" || inv.status === "VOID") throw new UserError("saasErrors.invoiceClosed");
  const method = await db.paymentMethod.findUnique({ where: { code: p.methodCode } });
  if (!method || !method.isActive) throw new UserError("saasErrors.methodInactive");
  const credited = -((await db.invoice.aggregate({ where: { creditForId: inv.id }, _sum: { total: true } }))._sum.total ?? 0);
  const outstanding = inv.total - credited - inv.amountPaid;
  if (p.amount <= 0 || p.amount > outstanding) throw new UserError("saasErrors.invalidPayment", { max: (outstanding / 100).toFixed(2) });
  // Compared per calendar day: a payment dated today is valid at any time of the day.
  if (p.paidAt.toISOString().slice(0, 10) > now.toISOString().slice(0, 10)) throw new UserError("saasErrors.paymentInFuture");
  return db.$transaction(async (tx) => {
    const payment = await tx.payment.create({ data: { invoiceId: inv.id, organizationId: inv.organizationId, amount: p.amount, currency: inv.currency, paidAt: p.paidAt, methodCode: method.code, reference: p.reference, note: p.note, recordedById: userId } });
    const paid = inv.amountPaid + p.amount;
    await tx.invoice.update({ where: { id: inv.id }, data: { amountPaid: paid, status: statusAfterPayment(inv.total - credited, paid) } });
    // Payment received: a customer without other overdue invoices is no longer in arrears.
    const otherOverdue = (await tx.invoice.findMany({ where: { organizationId: inv.organizationId, id: { not: inv.id }, kind: "INVOICE", status: { in: ["OPEN", "PARTIALLY_PAID"] } } })).some((i) => isOverdue(i, now));
    if (!otherOverdue && statusAfterPayment(inv.total - credited, paid) === "PAID") {
      await tx.subscription.updateMany({ where: { organizationId: inv.organizationId, status: "PAST_DUE" }, data: { status: "ACTIVE" } });
      await tx.organization.updateMany({ where: { id: inv.organizationId, status: "PAYMENT_DUE" }, data: { status: "ACTIVE" } });
    }
    await tx.auditLog.create({ data: { companyId: null, userId, action: "payment.recorded", entity: "Organization", entityId: inv.organizationId, details: { invoice: inv.number, amount: p.amount, method: method.code, reference: p.reference } } });
    return payment;
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Scheduled processing (trial reminders, trial expiry, arrears) — idempotent
// ---------------------------------------------------------------------------------------------------------------

export async function processSubscriptions(now = new Date()) {
  const settings = await saasSettings();
  const result = { reminders: 0, expired: 0, pastDue: 0, cancelled: 0 };
  const trials = await db.subscription.findMany({ where: { status: "TRIAL", trialEnd: { not: null } }, include: { organization: { include: { companies: { select: { id: true } } } } } });
  for (const s of trials) {
    if (s.trialEnd! <= now) {
      await db.$transaction(async (tx) => {
        const updated = await tx.subscription.update({ where: { id: s.id }, data: { status: "EXPIRED" } });
        await event(tx, updated, "EXPIRED", null, { trialEnd: s.trialEnd!.toISOString() });
      });
      result.expired++;
    } else if (!s.trialReminderAt && s.trialEnd! <= addDays(now, settings.trialReminderDays)) {
      const days = Math.ceil((s.trialEnd!.getTime() - now.getTime()) / 86_400_000);
      await db.$transaction(async (tx) => {
        for (const c of s.organization.companies) {
          await tx.notification.create({ data: { companyId: c.id, type: "subscription.trialEnding", params: { days, date: s.trialEnd!.toISOString() } } });
        }
        const updated = await tx.subscription.update({ where: { id: s.id }, data: { trialReminderAt: now } });
        await event(tx, updated, "TRIAL_REMINDER", null, { days });
      });
      result.reminders++;
    }
  }
  const open = await db.invoice.findMany({ where: { kind: "INVOICE", status: { in: ["OPEN", "PARTIALLY_PAID"] }, dueDate: { lt: now } }, select: { organizationId: true } });
  for (const orgId of new Set(open.map((i) => i.organizationId))) {
    const r = await db.subscription.updateMany({ where: { organizationId: orgId, status: "ACTIVE" }, data: { status: "PAST_DUE" } });
    await db.organization.updateMany({ where: { id: orgId, status: { in: ["ACTIVE", "TRIAL"] } }, data: { status: "PAYMENT_DUE" } });
    result.pastDue += r.count;
  }
  // Cancellations whose end date has been reached: the customer status follows.
  const ended = await db.subscription.findMany({ where: { status: "CANCELLED", endDate: { lte: now }, organization: { status: { not: "CANCELLED" } } }, select: { organizationId: true, createdAt: true } });
  for (const orgId of new Set(ended.map((e) => e.organizationId))) {
    const latest = await currentSubscription(orgId);
    if (latest?.status === "CANCELLED") { await db.organization.update({ where: { id: orgId }, data: { status: "CANCELLED" } }); result.cancelled++; }
  }
  return result;
}

// ---------------------------------------------------------------------------------------------------------------
// Support access (read-only, logged, time-limited)
// ---------------------------------------------------------------------------------------------------------------

export async function startSupportAccess(admin: User, companyId: string, reason: string, hours: number) {
  if (!isSuperAdmin(admin)) throw new UserError("errors.forbidden");
  if (reason.trim().length < 10) throw new UserError("saasErrors.reasonRequired");
  const company = await db.company.findUnique({ where: { id: companyId } });
  if (!company) throw new UserError("errors.notFound");
  const h = Math.min(8, Math.max(1, Math.round(hours)));
  const access = await db.supportAccess.create({ data: { adminUserId: admin.id, organizationId: company.organizationId, companyId, reason: reason.trim(), expiresAt: addDays(new Date(), h / 24) } });
  // Logged in the customer's own audit log as well, so the customer can see the access.
  await audit({ companyId, userId: admin.id, action: "support.access_started", entity: "SupportAccess", entityId: access.id, details: { reason: access.reason, expiresAt: access.expiresAt.toISOString() } });
  return access;
}

export async function endSupportAccess(admin: User, accessId: string) {
  const a = await db.supportAccess.findFirst({ where: { id: accessId, adminUserId: admin.id, endedAt: null } });
  if (!a) return;
  await db.supportAccess.update({ where: { id: a.id }, data: { endedAt: new Date() } });
  await audit({ companyId: a.companyId, userId: admin.id, action: "support.access_ended", entity: "SupportAccess", entityId: a.id });
}

export const activeSupportSessions = (adminUserId: string, now = new Date()) =>
  db.supportAccess.findMany({ where: { adminUserId, endedAt: null, expiresAt: { gt: now } } });

/** Latest subscription per customer (with plan and customer name). */
export async function currentSubscriptions() {
  const subs = await db.subscription.findMany({ orderBy: { createdAt: "desc" }, include: { plan: true, organization: { select: { id: true, name: true } } } });
  const seen = new Set<string>();
  return subs.filter((s) => (seen.has(s.organizationId) ? false : (seen.add(s.organizationId), true)));
}
