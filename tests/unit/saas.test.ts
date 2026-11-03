import { describe, expect, it } from "vitest";
import { accessFor, addCycle, applyDiscount, capacity, cyclePrice, invoiceAmounts, invoiceNumber, isOverdue, monthlyRevenue, mrrByCurrency, statusAfterPayment, trialDaysLeft, type SubLike } from "@/lib/saas";

const NOW = new Date("2026-11-03T12:00:00Z");
const sub = (o: Partial<SubLike> = {}): SubLike => ({
  status: "ACTIVE", billingCycle: "MONTHLY", priceMonthly: 150000, priceYearly: 1500000, currency: "SRD",
  discountBp: 0, trialEnd: null, maxEmployees: 30, extraEmployees: 0, endDate: null, ...o,
});
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

describe("prices and revenue", () => {
  it("applies discounts in basis points, clamped to 0–100%", () => {
    expect(applyDiscount(150000, 1000)).toBe(135000);
    expect(applyDiscount(150000, -5)).toBe(150000);
    expect(applyDiscount(150000, 20000)).toBe(0);
  });
  it("uses the agreed price of the billing cycle", () => {
    expect(cyclePrice(sub())).toBe(150000);
    expect(cyclePrice(sub({ billingCycle: "YEARLY" }))).toBe(1500000);
    expect(cyclePrice(sub({ priceMonthly: null }))).toBeNull();
  });
  it("counts only paying subscriptions in MRR; yearly prices divided by 12 after discount", () => {
    expect(monthlyRevenue(sub())).toBe(150000);
    expect(monthlyRevenue(sub({ status: "PAST_DUE" }))).toBe(150000);
    expect(monthlyRevenue(sub({ billingCycle: "YEARLY", discountBp: 1000 }))).toBe(112500);
    for (const status of ["TRIAL", "SUSPENDED", "CANCELLED", "EXPIRED"] as const) expect(monthlyRevenue(sub({ status }))).toBe(0);
    expect(monthlyRevenue(sub({ priceMonthly: null }))).toBe(0);
  });
  it("never adds different currencies together", () => {
    expect(mrrByCurrency([sub(), sub({ priceMonthly: 75000 }), sub({ currency: "USD", priceMonthly: 5000 }), sub({ status: "TRIAL" })])).toEqual({ SRD: 225000, USD: 5000 });
    expect(mrrByCurrency([])).toEqual({});
  });
});

describe("trials and access", () => {
  it("counts remaining trial days", () => {
    expect(trialDaysLeft(days(10), NOW)).toBe(10);
    expect(trialDaysLeft(days(0.2), NOW)).toBe(1);
    expect(trialDaysLeft(days(-3), NOW)).toBe(0);
    expect(trialDaysLeft(null, NOW)).toBeNull();
  });
  it("gives full access to active subscriptions and to legacy customers without a subscription", () => {
    expect(accessFor("ACTIVE", sub(), NOW).level).toBe("OK");
    expect(accessFor("ACTIVE", null, NOW)).toEqual({ level: "OK", reason: "NO_SUBSCRIPTION" });
  });
  it("warns in the last 7 trial days and blocks after the trial ends", () => {
    expect(accessFor("TRIAL", sub({ status: "TRIAL", trialEnd: days(20) }), NOW).level).toBe("OK");
    expect(accessFor("TRIAL", sub({ status: "TRIAL", trialEnd: days(5) }), NOW)).toMatchObject({ level: "WARNING", reason: "TRIAL", daysLeft: 5 });
    expect(accessFor("TRIAL", sub({ status: "TRIAL", trialEnd: days(-1) }), NOW)).toMatchObject({ level: "BLOCKED", reason: "TRIAL_ENDED" });
  });
  it("blocks suspended, expired and ended subscriptions and blocked customers", () => {
    expect(accessFor("ACTIVE", sub({ status: "SUSPENDED" }), NOW)).toMatchObject({ level: "BLOCKED", reason: "SUSPENDED" });
    expect(accessFor("ACTIVE", sub({ status: "EXPIRED" }), NOW)).toMatchObject({ level: "BLOCKED", reason: "EXPIRED" });
    expect(accessFor("ACTIVE", sub({ status: "CANCELLED", endDate: days(-1) }), NOW)).toMatchObject({ level: "BLOCKED", reason: "CANCELLED" });
    expect(accessFor("SUSPENDED", sub(), NOW)).toMatchObject({ level: "BLOCKED", reason: "SUSPENDED" });
    expect(accessFor("CANCELLED", null, NOW)).toMatchObject({ level: "BLOCKED", reason: "CANCELLED" });
  });
  it("keeps access with a warning until a cancellation takes effect, and while payment is overdue", () => {
    expect(accessFor("ACTIVE", sub({ status: "CANCELLED", endDate: days(10) }), NOW)).toMatchObject({ level: "WARNING", reason: "CANCELLED" });
    expect(accessFor("PAYMENT_DUE", sub({ status: "PAST_DUE" }), NOW)).toMatchObject({ level: "WARNING", reason: "PAST_DUE" });
  });
  it("computes capacity including extra employees (null = unlimited)", () => {
    expect(capacity(sub({ extraEmployees: 5 }))).toBe(35);
    expect(capacity(sub({ maxEmployees: null }))).toBeNull();
    expect(capacity(null)).toBeNull();
  });
});

describe("billing", () => {
  it("adds one billing cycle, capping the day at month end", () => {
    expect(addCycle(new Date("2026-01-15T00:00:00Z"), "MONTHLY").toISOString().slice(0, 10)).toBe("2026-02-15");
    expect(addCycle(new Date("2026-01-31T00:00:00Z"), "MONTHLY").toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(addCycle(new Date("2028-01-31T00:00:00Z"), "MONTHLY").toISOString().slice(0, 10)).toBe("2028-02-29");
    expect(addCycle(new Date("2026-12-31T00:00:00Z"), "MONTHLY").toISOString().slice(0, 10)).toBe("2027-01-31");
    expect(addCycle(new Date("2028-02-29T00:00:00Z"), "YEARLY").toISOString().slice(0, 10)).toBe("2029-02-28");
  });
  it("numbers invoices per series with four digits", () => {
    expect(invoiceNumber("ARA", 2026, 1)).toBe("ARA-2026-0001");
    expect(invoiceNumber("ARA-CN", 2026, 42)).toBe("ARA-CN-2026-0042");
  });
  it("splits invoice amounts into subtotal, discount and total", () => {
    expect(invoiceAmounts(150000, 1000)).toEqual({ subtotal: 150000, discount: 15000, total: 135000 });
    expect(invoiceAmounts(75000, 0)).toEqual({ subtotal: 75000, discount: 0, total: 75000 });
  });
  it("derives the status after payments", () => {
    expect(statusAfterPayment(100, 0)).toBe("OPEN");
    expect(statusAfterPayment(100, 40)).toBe("PARTIALLY_PAID");
    expect(statusAfterPayment(100, 100)).toBe("PAID");
  });
  it("marks only open invoices past their due date as overdue", () => {
    expect(isOverdue({ status: "OPEN", dueDate: days(-1) }, NOW)).toBe(true);
    expect(isOverdue({ status: "PARTIALLY_PAID", dueDate: days(-1) }, NOW)).toBe(true);
    expect(isOverdue({ status: "PAID", dueDate: days(-1) }, NOW)).toBe(false);
    expect(isOverdue({ status: "OPEN", dueDate: days(1) }, NOW)).toBe(false);
    expect(isOverdue({ status: "OPEN", dueDate: days(-1), kind: "CREDIT_NOTE" }, NOW)).toBe(false);
  });
});
