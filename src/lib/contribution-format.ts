import type { Fmt } from "@/lib/format";

type T = (key: string, values?: Record<string, string | number>) => string;
type Shares = { method: string; employeeRateBp: number; employerRateBp: number; employeeAmount: number; employerAmount: number; currency: string };

/** "2,5% / 5% of base salary" or "SRD 150 / SRD 300 per month" (employee / employer). */
export function describeShare(s: Shares, side: "employee" | "employer", f: Fmt) {
  if (s.method === "FIXED") return f.money(side === "employee" ? s.employeeAmount : s.employerAmount, s.currency);
  return f.pct(side === "employee" ? s.employeeRateBp : s.employerRateBp);
}

export function describeBase(s: { method: string; base: string; maxBaseMonthly: number | null; currency: string }, t: T, f: Fmt) {
  if (s.method === "FIXED") return t("contrib.fixedPerMonth");
  const base = t(`enums.contributionBase.${s.base}`);
  return s.maxBaseMonthly != null ? `${base} · ${t("contrib.maxBaseShort", { amount: f.money(s.maxBaseMonthly, s.currency) })}` : base;
}
