import "server-only";
import { db } from "@/lib/db";

/**
 * Annual leave balances (entitlement prorated by hire date) including carried-forward days where the
 * leave type allows it, capped by its maximum.
 */
export async function leaveBalances(companyId: string, employeeId: string, year: number) {
  return (await leaveBalancesFor(companyId, [employeeId], year)).get(employeeId) ?? [];
}

/**
 * Balances for several employees at once (overview pages). Taken days count the approved days of each request
 * (or the requested days when no separate approval quantity was recorded); manual adjustments are added.
 */
export async function leaveBalancesFor(companyId: string, employeeIds: string[], year: number) {
  const [types, emps, requests, adjustments] = await Promise.all([
    db.leaveType.findMany({ where: { companyId, annualEntitlementDays: { gt: 0 } }, orderBy: { name: "asc" } }),
    db.employee.findMany({ where: { id: { in: employeeIds }, companyId } }),
    db.leaveRequest.findMany({ where: { employeeId: { in: employeeIds }, status: "APPROVED", startDate: { gte: new Date(Date.UTC(year - 1, 0, 1)), lte: new Date(Date.UTC(year, 11, 31)) } }, select: { employeeId: true, leaveTypeId: true, startDate: true, days: true, approvedDays: true } }),
    db.leaveBalanceAdjustment.findMany({ where: { employeeId: { in: employeeIds }, year: { in: [year - 1, year] } } }),
  ]);
  const out = new Map<string, { type: (typeof types)[number]; entitlement: number; carried: number; adjusted: number; taken: number; remaining: number }[]>();
  for (const emp of emps) {
    const entitlementFor = (base: number, y: number) => {
      const hireYear = emp.hireDate.getUTCFullYear();
      const factor = hireYear < y ? 1 : hireYear > y ? 0 : (12 - emp.hireDate.getUTCMonth()) / 12;
      return Math.round(base * factor * 2) / 2;
    };
    const taken = (typeId: string, y: number) => requests.filter((r) => r.employeeId === emp.id && r.leaveTypeId === typeId && r.startDate.getUTCFullYear() === y).reduce((s, r) => s + (r.approvedDays ?? r.days), 0);
    const adj = (typeId: string, y: number) => adjustments.filter((a) => a.employeeId === emp.id && a.leaveTypeId === typeId && a.year === y).reduce((s, a) => s + a.days, 0);
    out.set(emp.id, types.map((t) => {
      const carried = t.carryForward ? Math.max(0, Math.min(t.maxCarryForwardDays, entitlementFor(t.annualEntitlementDays, year - 1) + adj(t.id, year - 1) - taken(t.id, year - 1))) : 0;
      const adjusted = adj(t.id, year);
      const entitlement = entitlementFor(t.annualEntitlementDays, year) + carried + adjusted;
      const takenNow = taken(t.id, year);
      return { type: t, entitlement, carried, adjusted, taken: takenNow, remaining: entitlement - takenNow };
    }));
  }
  return out;
}

/**
 * Parental leave entitlement per event (child): statutory entitlement plus the company's additional benefit,
 * minus approved leave for the same child. Statutory and company parts are reported separately.
 */
export async function parentalEntitlements(companyId: string, employeeId: string) {
  const [types, requests] = await Promise.all([
    db.leaveType.findMany({ where: { companyId, category: { in: ["PARENTAL", "MATERNITY", "PATERNITY", "ADOPTION"] } }, orderBy: { name: "asc" } }),
    db.leaveRequest.findMany({ where: { employeeId, leaveType: { companyId, category: { in: ["PARENTAL", "MATERNITY", "PATERNITY", "ADOPTION"] } }, status: { in: ["APPROVED", "PENDING"] } } }),
  ]);
  return types.map((t) => {
    const statutory = t.statutoryDays ?? 0;
    const total = statutory + t.companyExtraDays;
    const byChild = new Map<string, number>();
    for (const r of requests.filter((x) => x.leaveTypeId === t.id && x.status === "APPROVED")) {
      const key = r.childBirthDate?.toISOString().slice(0, 10) ?? "—";
      byChild.set(key, (byChild.get(key) ?? 0) + (r.approvedDays ?? r.days) * (r.schedulePercentBp / 10000));
    }
    return { type: t, statutory, companyExtra: t.companyExtraDays, total, perChild: [...byChild.entries()].map(([child, used]) => ({ child, used, remaining: total ? total - used : null })) };
  });
}
