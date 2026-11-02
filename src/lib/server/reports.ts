import "server-only";
import { db } from "@/lib/db";
import { lineGroup } from "@/lib/payroll/summary";

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

export type ContributionTotals = {
  healthEmployee: number; healthEmployer: number; pensionEmployee: number; pensionEmployer: number; fvoEmployee: number; fvoEmployer: number;
  employerCosts: number; employmentCost: number; gross: number;
};
const emptyTotals = (): ContributionTotals => ({ healthEmployee: 0, healthEmployer: 0, pensionEmployee: 0, pensionEmployer: 0, fvoEmployee: 0, fvoEmployer: 0, employerCosts: 0, employmentCost: 0, gross: 0 });

/**
 * Employee and employer contributions (health insurance, pension, FVO) and employer costs, per payroll period
 * and per employee. Based on the stored payslip lines (also for payslips calculated before line groups existed).
 * Totals are kept per calculation currency.
 */
export async function contributionReport(companyId: string, year: number, finalOnly = true) {
  const slips = await db.payslip.findMany({
    where: { run: { companyId, year, status: finalOnly ? { in: ["APPROVED", "PAID"] } : { in: ["CALCULATED", "APPROVED", "PAID"] } } },
    select: {
      employeeId: true, employeeName: true, employeeNumber: true, calcCurrency: true, grossPay: true, employerCost: true, run: { select: { month: true } },
      lines: { where: { type: { in: ["DEDUCTION", "EMPLOYER"] } }, select: { type: true, code: true, amount: true, source: true, group: true } },
    },
  });
  const byMonth = new Map<string, ContributionTotals & { month: number; currency: string; employees: number }>();
  const byEmployee = new Map<string, ContributionTotals & { employeeId: string; name: string; number: string; currency: string }>();
  for (const s of slips) {
    const t = emptyTotals();
    for (const l of s.lines) {
      const g = lineGroup(l);
      const side = l.type === "EMPLOYER" ? "Employer" : "Employee";
      if (g === "HEALTH") t[`health${side}`] += l.amount;
      else if (g === "PENSION") t[`pension${side}`] += l.amount;
      else if (g === "FVO") t[`fvo${side}`] += l.amount;
    }
    t.gross = s.grossPay;
    t.employmentCost = s.employerCost;
    t.employerCosts = s.employerCost - s.grossPay;
    const add = (r: ContributionTotals) => { for (const k of Object.keys(t) as (keyof ContributionTotals)[]) r[k] += t[k]; };
    const mk = `${s.run.month}:${s.calcCurrency}`;
    const m = byMonth.get(mk) ?? { ...emptyTotals(), month: s.run.month, currency: s.calcCurrency, employees: 0 };
    add(m); m.employees += 1; byMonth.set(mk, m);
    const ek = `${s.employeeId}:${s.calcCurrency}`;
    const e = byEmployee.get(ek) ?? { ...emptyTotals(), employeeId: s.employeeId, name: s.employeeName, number: s.employeeNumber, currency: s.calcCurrency };
    add(e); byEmployee.set(ek, e);
  }
  return {
    months: [...byMonth.values()].sort((a, b) => a.month - b.month || a.currency.localeCompare(b.currency)),
    employees: [...byEmployee.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}
