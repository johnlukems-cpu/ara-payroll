import "server-only";
import { db } from "@/lib/db";

/**
 * Next free personnel number for a company: the highest numeric number + 1 (starting at 1001).
 * Non-numeric numbers entered by hand are ignored; uniqueness is still enforced by the database.
 */
export async function nextEmployeeNumber(companyId: string): Promise<string> {
  const rows = await db.employee.findMany({ where: { companyId }, select: { employeeNumber: true } });
  const max = rows.reduce((m, r) => (/^\d{1,9}$/.test(r.employeeNumber) ? Math.max(m, Number(r.employeeNumber)) : m), 1000);
  return String(max + 1);
}
