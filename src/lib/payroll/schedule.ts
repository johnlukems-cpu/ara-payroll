/**
 * When is a fixed (employee) pay component processed? Pure, so it can be unit tested.
 *
 *  MONTHLY / PER_PERIOD  every payroll period within the validity period (runs are monthly today)
 *  ONE_OFF               once, in the period that contains the start (payment) date
 *  ANNUAL                once a year, in the payment month (default: month of the start date)
 *  ACCRUAL               built up every period, paid out in the payment month (default December)
 *                        or in the period in which the assignment ends (e.g. termination)
 */
export type AssignmentFrequency = "MONTHLY" | "PER_PERIOD" | "ONE_OFF" | "ANNUAL" | "ACCRUAL";

export interface ScheduledAssignment {
  frequency: AssignmentFrequency;
  startDate: Date;
  endDate: Date | null;
  payMonth: number | null;
  isActive: boolean;
}

/** skip = not processed; pay = on the payslip; accrue = built up only; accrueAndPay = built up and paid out with earlier accruals. */
export type ScheduleDecision = "skip" | "pay" | "accrue" | "accrueAndPay";

const ym = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth();

export function scheduleFor(a: ScheduledAssignment, year: number, month: number): ScheduleDecision {
  if (!a.isActive) return "skip";
  const period = year * 12 + (month - 1);
  if (ym(a.startDate) > period) return "skip";
  if (a.endDate && ym(a.endDate) < period) return "skip";
  switch (a.frequency) {
    case "ONE_OFF":
      return ym(a.startDate) === period ? "pay" : "skip";
    case "ANNUAL":
      return month === (a.payMonth ?? a.startDate.getUTCMonth() + 1) ? "pay" : "skip";
    case "ACCRUAL": {
      const endsNow = a.endDate !== null && ym(a.endDate) === period;
      return month === (a.payMonth ?? 12) || endsNow ? "accrueAndPay" : "accrue";
    }
    default:
      return "pay";
  }
}

/** Accrual state stored per assignment in the payslip trace (`trace.accruals[assignmentId]`). */
export type AccrualState = { code?: string; name?: string; accrued: number; paid: number; balance: number };

/** Balance carried forward: the most recent earlier payslip's balance for the assignment (0 after a payout). */
export function priorAccrual(earlier: { year: number; month: number; trace: unknown }[], assignmentId: string): number {
  let best: { p: number; balance: number } | null = null;
  for (const s of earlier) {
    const acc = (s.trace as { accruals?: Record<string, AccrualState> } | null)?.accruals?.[assignmentId];
    if (!acc) continue;
    const p = s.year * 12 + s.month;
    if (!best || p > best.p) best = { p, balance: acc.balance };
  }
  return best?.balance ?? 0;
}
