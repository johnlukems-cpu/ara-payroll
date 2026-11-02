import "server-only";
import { db } from "@/lib/db";

export async function yearlySummary(companyId: string, year: number) {
  const runs = await db.payrollRun.findMany({ where: { companyId, year, status: { in: ["CALCULATED", "APPROVED", "PAID"] } }, orderBy: { month: "asc" } });
  return runs;
}

/** Per-employee annual totals (basis for the annual statement / jaaropgave). */
export async function annualStatements(companyId: string, year: number, finalOnly = true) {
  const slips = await db.payslip.findMany({
    where: { run: { companyId, year, status: finalOnly ? { in: ["APPROVED", "PAID"] } : undefined } },
    select: { employeeId: true, employeeName: true, employeeNumber: true, calcCurrency: true, grossPay: true, taxableWage: true, wageTax: true, aov: true, totalDeductions: true, netPay: true, employerCost: true, run: { select: { month: true } } },
  });
  // Totals are kept per statutory calculation currency so amounts in different currencies are never added together.
  const map = new Map<string, { employeeId: string; name: string; number: string; currency: string; months: number; gross: number; taxable: number; tax: number; aov: number; deductions: number; net: number; employer: number }>();
  for (const s of slips) {
    const key = `${s.employeeId}:${s.calcCurrency}`;
    const r = map.get(key) ?? { employeeId: s.employeeId, name: s.employeeName, number: s.employeeNumber, currency: s.calcCurrency, months: 0, gross: 0, taxable: 0, tax: 0, aov: 0, deductions: 0, net: 0, employer: 0 };
    r.months += 1; r.gross += s.grossPay; r.taxable += s.taxableWage; r.tax += s.wageTax; r.aov += s.aov; r.deductions += s.totalDeductions; r.net += s.netPay; r.employer += s.employerCost;
    map.set(key, r);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Employer cost per department in the given reporting currency (payslips calculated in another base currency are excluded). */
export async function departmentCosts(companyId: string, year: number, currency: string, unassigned: string) {
  const slips = await db.payslip.findMany({ where: { baseCurrency: currency, run: { companyId, year, status: { in: ["APPROVED", "PAID"] } } }, select: { department: true, employerCostBase: true } });
  const m = new Map<string, number>();
  for (const s of slips) m.set(s.department ?? unassigned, (m.get(s.department ?? unassigned) ?? 0) + s.employerCostBase);
  return [...m.entries()].map(([name, cost]) => ({ name, cost })).sort((a, b) => b.cost - a.cost);
}
