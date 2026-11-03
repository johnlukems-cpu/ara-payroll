/**
 * Integration tests (PostgreSQL) for the SaaS lifecycle: registration → approval → account, company and trial →
 * trial reminder and expiry → extend / convert → upgrade / downgrade with history → invoices, payments, credit notes →
 * arrears → suspend / resume → cancellation, plus support access rules. Uses its own plans and customers.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import bcrypt from "bcryptjs";
import { PrismaClient, type Plan, type User } from "@prisma/client";
import {
  approveRegistration, cancelSubscription, changePlan, convertTrial, createCustomer, createSubscriptionInvoice, creditInvoice, extendTrial,
  processSubscriptions, recordPayment, renewSubscription, resumeSubscription, saasSettings, setDiscount, startSupportAccess, suspendSubscription,
} from "@/lib/server/saas";
import { accessFor, addDays } from "@/lib/saas";

const db = new PrismaClient();
const TS = Date.now();
let basic: Plan;
let plus: Plan;
let admin: User;
let superAdmin: User;
let orgId: string;
let companyId: string;
let subId: string;
const orgIds: string[] = [];
const emails = [`reg-${TS}@it.test`, `b-${TS}@it.test`, `admin-${TS}@it.test`, `super-${TS}@it.test`];

const sub = () => db.subscription.findUniqueOrThrow({ where: { id: subId }, include: { events: { orderBy: { createdAt: "asc" } } } });
const org = () => db.organization.findUniqueOrThrow({ where: { id: orgId } });
const access = async () => { const s = await sub(); return accessFor((await org()).status, s, new Date()); };
const day = (n: number) => addDays(new Date(), n);

beforeAll(async () => {
  basic = await db.plan.create({ data: { code: `it-basic-${TS}`, nameNl: "IT Basis", nameEn: "IT Basic", monthlyPrice: 75000, yearlyPrice: 750000, maxEmployees: 2, trialDays: 30, sortOrder: 900, isPublished: false } });
  plus = await db.plan.create({ data: { code: `it-plus-${TS}`, nameNl: "IT Plus", nameEn: "IT Plus", monthlyPrice: 150000, yearlyPrice: 1500000, maxEmployees: 30, trialDays: 30, sortOrder: 901, isPublished: false } });
  admin = await db.user.create({ data: { email: emails[2], name: "IT SaaS admin", passwordHash: "x", platformRole: "SAAS_ADMIN" } });
  superAdmin = await db.user.create({ data: { email: emails[3], name: "IT super", passwordHash: "x", platformRole: "SUPER_ADMIN" } });
});

afterAll(async () => {
  await db.auditLog.deleteMany({ where: { OR: [{ entityId: { in: orgIds } }, { userId: { in: [admin.id, superAdmin.id] } }] } });
  await db.organization.deleteMany({ where: { id: { in: orgIds } } });
  await db.contactRequest.deleteMany({ where: { email: { in: emails } } });
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.plan.deleteMany({ where: { id: { in: [basic.id, plus.id] } } });
  await db.$disconnect();
});

describe("registration and approval", () => {
  it("turns an approved registration into user, organisation, company and trial subscription", async () => {
    const hash = await bcrypt.hash("Welkom123!", 4);
    const req = await db.contactRequest.create({ data: { type: "REGISTRATION", plan: basic.code, name: "Ria Registratie", company: "Ria BV", organizationName: "Ria Groep", email: emails[0], currency: "SRD", passwordHash: hash } });
    const res = await approveRegistration(req.id, admin.id);
    orgId = res.org.id; companyId = res.company.id; subId = res.subscription.id; orgIds.push(orgId);

    const user = await db.user.findUniqueOrThrow({ where: { email: emails[0] }, include: { memberships: true } });
    expect(await bcrypt.compare("Welkom123!", user.passwordHash)).toBe(true); // the password the applicant chose
    expect(user.memberships).toEqual([expect.objectContaining({ companyId, role: "OWNER" })]);
    expect((await db.company.findUniqueOrThrow({ where: { id: companyId } })).organizationId).toBe(orgId);
    expect(await db.payComponent.count({ where: { companyId } })).toBeGreaterThan(0); // company defaults seeded

    const s = await sub();
    expect(s).toMatchObject({ status: "TRIAL", planId: basic.id, priceMonthly: 75000, maxEmployees: 2 });
    expect(Math.round((s.trialEnd!.getTime() - s.trialStart!.getTime()) / 86_400_000)).toBe(30);
    expect(s.events.map((e) => e.type)).toEqual(["ASSIGNED"]);
    expect((await org()).status).toBe("TRIAL");

    const done = await db.contactRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(done).toMatchObject({ status: "CONVERTED", organizationId: orgId, passwordHash: null });
    await expect(approveRegistration(req.id, admin.id)).rejects.toThrow();
  });
});

describe("trial", () => {
  it("sends one reminder before the trial ends", async () => {
    const { trialReminderDays } = await saasSettings();
    await db.subscription.update({ where: { id: subId }, data: { trialEnd: day(Math.min(3, trialReminderDays)) } });
    await processSubscriptions();
    await processSubscriptions();
    const notes = await db.notification.findMany({ where: { companyId, type: "subscription.trialEnding" } });
    expect(notes).toHaveLength(1);
    expect((await sub()).events.filter((e) => e.type === "TRIAL_REMINDER")).toHaveLength(1);
    expect((await access()).level).toBe("WARNING");
  });

  it("expires after the end date and then blocks access", async () => {
    await db.subscription.update({ where: { id: subId }, data: { trialEnd: day(-0.01) } });
    expect((await access()).level).toBe("BLOCKED"); // blocked by date even before processing
    await processSubscriptions();
    expect((await sub()).status).toBe("EXPIRED");
    expect(await access()).toMatchObject({ level: "BLOCKED", reason: "EXPIRED" });
  });

  it("can be extended by an administrator and converted to a paid subscription", async () => {
    await extendTrial(subId, admin.id, 14);
    let s = await sub();
    expect(s.status).toBe("TRIAL");
    expect(s.trialEnd!.getTime()).toBeGreaterThan(day(13).getTime());
    expect((await access()).level).toBe("OK");
    await convertTrial(subId, admin.id, "MONTHLY");
    s = await sub();
    expect(s.status).toBe("ACTIVE");
    expect((await org()).status).toBe("ACTIVE");
    await expect(renewSubscription(subId, admin.id)).resolves.toBeTruthy();
  });
});

describe("plan changes keep historic terms", () => {
  it("does not change the agreed price when the plan price changes", async () => {
    await db.plan.update({ where: { id: basic.id }, data: { monthlyPrice: 99900 } });
    expect((await sub()).priceMonthly).toBe(75000);
  });

  it("upgrades and downgrades with before/after terms in the history", async () => {
    await changePlan(subId, plus.code, admin.id);
    let s = await sub();
    expect(s).toMatchObject({ planId: plus.id, priceMonthly: 150000, maxEmployees: 30 });
    const up = s.events.at(-1)!;
    expect(up.type).toBe("UPGRADED");
    expect(up.details).toMatchObject({ before: { priceMonthly: 75000 }, after: { priceMonthly: 150000 } });
    await expect(changePlan(subId, plus.code, admin.id)).rejects.toThrow();
    await changePlan(subId, basic.code, admin.id);
    s = await sub();
    expect(s.events.at(-1)!.type).toBe("DOWNGRADED");
    expect(s.priceMonthly).toBe(99900); // the plan's price at the moment of the change
    await changePlan(subId, plus.code, admin.id);
    const logged = await db.auditLog.count({ where: { entityId: orgId, action: { startsWith: "subscription." } } });
    expect(logged).toBeGreaterThanOrEqual(6);
  });
});

describe("invoices and payments", () => {
  let first: string;
  it("numbers invoices sequentially and advances the next invoice date", async () => {
    const before = (await sub()).nextInvoiceDate!;
    const a = await createSubscriptionInvoice(subId, admin.id);
    const b = await createSubscriptionInvoice(subId, admin.id);
    first = a.id;
    const { invoicePrefix } = await saasSettings();
    const year = new Date().getUTCFullYear();
    expect(a.number).toMatch(new RegExp(`^${invoicePrefix}-${year}-\\d{4}$`));
    expect(Number(b.number.slice(-4))).toBe(Number(a.number.slice(-4)) + 1);
    expect(a).toMatchObject({ total: 150000, subtotal: 150000, discount: 0, status: "OPEN", currency: "SRD" });
    expect(a.dueDate.getTime()).toBeGreaterThan(a.issueDate.getTime() - 1);
    expect((await sub()).nextInvoiceDate!.getTime()).toBeGreaterThan(before.getTime());

    const cn = await creditInvoice(b.id, admin.id, null, "Dubbel gefactureerd");
    expect(cn.number).toMatch(new RegExp(`^${invoicePrefix}-CN-${year}-\\d{4}$`));
    expect(cn.total).toBe(-150000);
    expect((await db.invoice.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("CREDITED");
    await expect(creditInvoice(b.id, admin.id, null, "nogmaals")).rejects.toThrow();
  });

  it("applies the agreed discount on the next invoice", async () => {
    await setDiscount(subId, admin.id, 1000, "Introductie");
    const inv = await createSubscriptionInvoice(subId, admin.id);
    expect(inv).toMatchObject({ subtotal: 150000, discount: 15000, total: 135000 });
    await creditInvoice(inv.id, admin.id, null, "Test opruimen");
    await setDiscount(subId, admin.id, 0, null);
  });

  it("records manual payments only within the outstanding amount and not in the future", async () => {
    await expect(recordPayment(first, admin.id, { amount: 150001, paidAt: new Date(), methodCode: "BANK_TRANSFER", reference: null, note: null })).rejects.toThrow();
    await expect(recordPayment(first, admin.id, { amount: 1000, paidAt: day(2), methodCode: "BANK_TRANSFER", reference: null, note: null })).rejects.toThrow();
    await expect(recordPayment(first, admin.id, { amount: 1000, paidAt: new Date(), methodCode: "NOPE", reference: null, note: null })).rejects.toThrow();
    await recordPayment(first, admin.id, { amount: 50000, paidAt: new Date(), methodCode: "BANK_TRANSFER", reference: "BANK-1", note: null });
    expect((await db.invoice.findUniqueOrThrow({ where: { id: first } }))).toMatchObject({ status: "PARTIALLY_PAID", amountPaid: 50000 });
    await recordPayment(first, admin.id, { amount: 100000, paidAt: new Date(), methodCode: "BANK_TRANSFER", reference: "BANK-2", note: null });
    expect((await db.invoice.findUniqueOrThrow({ where: { id: first } }))).toMatchObject({ status: "PAID", amountPaid: 150000 });
    expect(await db.payment.count({ where: { invoiceId: first } })).toBe(2);
  });

  it("puts overdue customers in arrears and restores them after payment", async () => {
    const inv = await createSubscriptionInvoice(subId, admin.id);
    await db.invoice.update({ where: { id: inv.id }, data: { dueDate: day(-1) } });
    await processSubscriptions();
    expect((await sub()).status).toBe("PAST_DUE");
    expect((await org()).status).toBe("PAYMENT_DUE");
    expect(await access()).toMatchObject({ level: "WARNING", reason: "PAST_DUE" });
    await recordPayment(inv.id, admin.id, { amount: inv.total, paidAt: new Date(), methodCode: "BANK_TRANSFER", reference: "BANK-3", note: null });
    expect((await sub()).status).toBe("ACTIVE");
    expect((await org()).status).toBe("ACTIVE");
  });
});

describe("suspension and cancellation", () => {
  it("blocks access while suspended and restores it on resume", async () => {
    await suspendSubscription(subId, admin.id, "Test opschorting");
    expect(await access()).toMatchObject({ level: "BLOCKED", reason: "SUSPENDED" });
    await expect(createSubscriptionInvoice(subId, admin.id)).rejects.toThrow();
    await resumeSubscription(subId, admin.id);
    expect((await access()).level).toBe("OK");
  });

  it("keeps access until a future end date, then blocks; no actions on an ended subscription", async () => {
    await cancelSubscription(subId, admin.id, "Klant stopt", day(10));
    expect(await access()).toMatchObject({ level: "WARNING", reason: "CANCELLED" });
    expect((await org()).status).toBe("ACTIVE");
    await renewSubscription(subId, admin.id);
    expect((await sub()).status).toBe("ACTIVE");
    await cancelSubscription(subId, admin.id, "Klant stopt definitief");
    expect(await access()).toMatchObject({ level: "BLOCKED", reason: "CANCELLED" });
    expect((await org()).status).toBe("CANCELLED");
    await expect(suspendSubscription(subId, admin.id, "x")).rejects.toThrow();
    await expect(changePlan(subId, basic.code, admin.id)).rejects.toThrow();
    await expect(createSubscriptionInvoice(subId, admin.id)).rejects.toThrow();
  });
});

describe("support access", () => {
  it("is reserved for super administrators, needs a reason and is logged for the customer", async () => {
    await expect(startSupportAccess(admin, companyId, "Ticket 1234 controle loonstrook", 1)).rejects.toThrow();
    await expect(startSupportAccess(superAdmin, companyId, "kort", 1)).rejects.toThrow();
    const a = await startSupportAccess(superAdmin, companyId, "Ticket 1234 controle loonstrook", 20);
    expect(a.expiresAt.getTime() - a.startedAt.getTime()).toBeLessThanOrEqual(8 * 3_600_000 + 1000);
    expect(await db.auditLog.count({ where: { companyId, action: "support.access_started" } })).toBe(1);
  });
});

describe("customers are separate tenants", () => {
  it("creates a second customer without any link to the first", async () => {
    const b = await createCustomer({ organizationName: "B Groep", companyName: "B BV", currency: "SRD", locale: "nl", owner: { name: "Bea", email: emails[1], passwordHash: "x" }, planCode: plus.code, trial: true, userId: admin.id });
    orgIds.push(b.org.id);
    const owner = await db.user.findUniqueOrThrow({ where: { email: emails[1] }, include: { memberships: { include: { company: true } } } });
    expect(owner.memberships.map((m) => m.company.organizationId)).toEqual([b.org.id]);
    const a = await db.user.findUniqueOrThrow({ where: { email: emails[0] }, include: { memberships: { include: { company: true } } } });
    expect(a.memberships.every((m) => m.company.organizationId === orgId)).toBe(true);
  });
});
