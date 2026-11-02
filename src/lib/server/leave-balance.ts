import "server-only";
import { db } from "@/lib/db";

/** Leave balances for an employee for a calendar year (entitlement prorated by hire date). */
export async function leaveBalances(companyId: string, employeeId: string, year: number) {
  const [types, emp, used] = await Promise.all([
    db.leaveType.findMany({ where: { companyId, annualEntitlementDays: { gt: 0 } }, orderBy: { name: "asc" } }),
    db.employee.findUniqueOrThrow({ where: { id: employeeId } }),
    db.leaveRequest.groupBy({
      by: ["leaveTypeId"],
      where: { employeeId, status: "APPROVED", startDate: { gte: new Date(Date.UTC(year, 0, 1)), lte: new Date(Date.UTC(year, 11, 31)) } },
      _sum: { days: true },
    }),
  ]);
  const hireYear = emp.hireDate.getUTCFullYear();
  const factor = hireYear < year ? 1 : hireYear > year ? 0 : (12 - emp.hireDate.getUTCMonth()) / 12;
  return types.map((t) => {
    const entitlement = Math.round(t.annualEntitlementDays * factor * 2) / 2;
    const taken = used.find((u) => u.leaveTypeId === t.id)?._sum.days ?? 0;
    return { type: t, entitlement, taken, remaining: entitlement - taken };
  });
}
