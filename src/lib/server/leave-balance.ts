import "server-only";
import { db } from "@/lib/db";

const yearRange = (year: number) => ({ gte: new Date(Date.UTC(year, 0, 1)), lte: new Date(Date.UTC(year, 11, 31)) });

/**
 * Annual leave balances (entitlement prorated by hire date) including carried-forward days where the
 * leave type allows it, capped by its maximum.
 */
export async function leaveBalances(companyId: string, employeeId: string, year: number) {
  const [types, emp, used, usedPrev] = await Promise.all([
    db.leaveType.findMany({ where: { companyId, annualEntitlementDays: { gt: 0 } }, orderBy: { name: "asc" } }),
    db.employee.findUniqueOrThrow({ where: { id: employeeId } }),
    db.leaveRequest.groupBy({ by: ["leaveTypeId"], where: { employeeId, status: "APPROVED", startDate: yearRange(year) }, _sum: { days: true, approvedDays: true } }),
    db.leaveRequest.groupBy({ by: ["leaveTypeId"], where: { employeeId, status: "APPROVED", startDate: yearRange(year - 1) }, _sum: { days: true, approvedDays: true } }),
  ]);
  const entitlementFor = (base: number, y: number) => {
    const hireYear = emp.hireDate.getUTCFullYear();
    const factor = hireYear < y ? 1 : hireYear > y ? 0 : (12 - emp.hireDate.getUTCMonth()) / 12;
    return Math.round(base * factor * 2) / 2;
  };
  const taken = (rows: typeof used, id: string) => {
    const r = rows.find((u) => u.leaveTypeId === id);
    return r?._sum.approvedDays ?? r?._sum.days ?? 0;
  };
  return types.map((t) => {
    const carried = t.carryForward ? Math.max(0, Math.min(t.maxCarryForwardDays, entitlementFor(t.annualEntitlementDays, year - 1) - taken(usedPrev, t.id))) : 0;
    const entitlement = entitlementFor(t.annualEntitlementDays, year) + carried;
    const takenNow = taken(used, t.id);
    return { type: t, entitlement, carried, taken: takenNow, remaining: entitlement - takenNow };
  });
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
