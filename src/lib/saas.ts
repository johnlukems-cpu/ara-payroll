/**
 * SaaS subscription rules (pure): recurring revenue, trials, access by status, invoice amounts and numbering.
 * Money in minor units; discounts in basis points.
 */
export type SubscriptionStatus = "TRIAL" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELLED" | "EXPIRED";
export type CustomerStatus = "NEW_REQUEST" | "IN_REVIEW" | "ACTIVE" | "TRIAL" | "PAYMENT_DUE" | "SUSPENDED" | "CANCELLED";
export type Cycle = "MONTHLY" | "YEARLY";

export type SubLike = {
  status: SubscriptionStatus; billingCycle: Cycle; priceMonthly: number | null; priceYearly: number | null; currency: string;
  discountBp: number; trialEnd: Date | null; maxEmployees: number | null; extraEmployees: number; endDate?: Date | null;
};

export const applyDiscount = (amount: number, discountBp: number) => Math.round((amount * (10000 - Math.min(10000, Math.max(0, discountBp)))) / 10000);

/** Price per billing cycle under the agreed terms (null when no price is agreed for that cycle). */
export function cyclePrice(s: Pick<SubLike, "billingCycle" | "priceMonthly" | "priceYearly">) {
  return s.billingCycle === "YEARLY" ? s.priceYearly : s.priceMonthly;
}

/** Monthly recurring revenue of one subscription: only paying subscriptions (active or payment due), after discount. */
export function monthlyRevenue(s: SubLike): number {
  if (s.status !== "ACTIVE" && s.status !== "PAST_DUE") return 0;
  const price = cyclePrice(s);
  if (price == null) return 0;
  const net = applyDiscount(price, s.discountBp);
  return s.billingCycle === "YEARLY" ? Math.round(net / 12) : net;
}

/** MRR per currency (amounts in different currencies are never added together). */
export function mrrByCurrency(subs: SubLike[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of subs) {
    const v = monthlyRevenue(s);
    if (v > 0) out[s.currency] = (out[s.currency] ?? 0) + v;
  }
  return out;
}

const DAY = 86_400_000;

/** Whole days left in a trial (0 on/after the end date; null when there is no trial end). */
export function trialDaysLeft(trialEnd: Date | null, now: Date): number | null {
  if (!trialEnd) return null;
  return Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / DAY));
}

export type Access = { level: "OK" | "WARNING" | "BLOCKED"; reason: "NONE" | "NO_SUBSCRIPTION" | "TRIAL" | "TRIAL_ENDED" | "PAST_DUE" | "SUSPENDED" | "CANCELLED" | "EXPIRED"; daysLeft?: number | null };

/**
 * Access of a customer's users to the payroll application, by customer and subscription status.
 * Customers without a subscription (created before subscriptions existed) keep full access.
 */
export function accessFor(customerStatus: CustomerStatus, sub: SubLike | null, now: Date): Access {
  if (customerStatus === "SUSPENDED") return { level: "BLOCKED", reason: "SUSPENDED" };
  if (customerStatus === "CANCELLED") return { level: "BLOCKED", reason: "CANCELLED" };
  if (!sub) return { level: "OK", reason: "NO_SUBSCRIPTION" };
  switch (sub.status) {
    case "SUSPENDED": return { level: "BLOCKED", reason: "SUSPENDED" };
    case "EXPIRED": return { level: "BLOCKED", reason: "EXPIRED" };
    case "CANCELLED": return sub.endDate && sub.endDate > now ? { level: "WARNING", reason: "CANCELLED" } : { level: "BLOCKED", reason: "CANCELLED" };
    case "TRIAL": {
      const daysLeft = trialDaysLeft(sub.trialEnd, now);
      if (sub.trialEnd && sub.trialEnd <= now) return { level: "BLOCKED", reason: "TRIAL_ENDED", daysLeft: 0 };
      return { level: daysLeft != null && daysLeft <= 7 ? "WARNING" : "OK", reason: "TRIAL", daysLeft };
    }
    case "PAST_DUE": return { level: "WARNING", reason: "PAST_DUE" };
    default: return { level: "OK", reason: "NONE" };
  }
}

/** Employee capacity under the agreed terms (null = unlimited). */
export const capacity = (s: Pick<SubLike, "maxEmployees" | "extraEmployees"> | null) => (s?.maxEmployees == null ? null : s.maxEmployees + s.extraEmployees);

/** One billing cycle later; the day is capped at the end of the target month (31 Jan + 1 month = 28/29 Feb). */
export function addCycle(d: Date, cycle: Cycle): Date {
  const months = cycle === "YEARLY" ? 12 : 1;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const r = new Date(d);
  r.setUTCDate(1);
  r.setUTCFullYear(y, m, Math.min(d.getUTCDate(), lastDay));
  return r;
}

export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY);

/** Invoice number, e.g. ARA-2026-0007. */
export const invoiceNumber = (prefix: string, year: number, seq: number) => `${prefix}-${year}-${String(seq).padStart(4, "0")}`;

export function invoiceAmounts(price: number, discountBp: number) {
  const total = applyDiscount(price, discountBp);
  return { subtotal: price, discount: price - total, total };
}

/** Invoice status after payments (credit notes handled separately). */
export function statusAfterPayment(total: number, paid: number): "OPEN" | "PARTIALLY_PAID" | "PAID" {
  if (paid <= 0) return "OPEN";
  return paid >= total ? "PAID" : "PARTIALLY_PAID";
}

export const isOverdue = (inv: { status: string; dueDate: Date; kind?: string }, now: Date) =>
  (inv.kind ?? "INVOICE") === "INVOICE" && (inv.status === "OPEN" || inv.status === "PARTIALLY_PAID") && inv.dueDate < now;
