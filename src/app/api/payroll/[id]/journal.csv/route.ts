import { db } from "@/lib/db";
import { csvResponse, dec } from "@/lib/server/csv";
import { notFound, withPermission } from "@/lib/server/route-auth";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return withPermission("payroll.view", async (ctx) => {
    const { id } = await params;
    const run = await db.payrollRun.findFirst({ where: { id, companyId: ctx.company.id }, include: { payslips: { include: { lines: true }, orderBy: { employeeName: "asc" } } } });
    if (!run) return notFound();
    const codes = [...new Set(run.payslips.flatMap((p) => p.lines.map((l) => `${l.type}:${l.code}`)))];
    const header = ["Employee no.", "Name", "Department", ...codes.map((c) => c.split(":")[1]), "Gross", "Taxable wage", "Wage tax", "AOV", "Total deductions", "Net pay", "Employer cost"];
    const rows = run.payslips.map((p) => {
      const byCode = new Map<string, number>();
      for (const l of p.lines) byCode.set(`${l.type}:${l.code}`, (byCode.get(`${l.type}:${l.code}`) ?? 0) + l.amount);
      return [p.employeeNumber, p.employeeName, p.department, ...codes.map((c) => dec(byCode.get(c) ?? 0)), dec(p.grossPay), dec(p.taxableWage), dec(p.wageTax), dec(p.aov), dec(p.totalDeductions), dec(p.netPay), dec(p.employerCost)];
    });
    const sum = (k: "grossPay" | "taxableWage" | "wageTax" | "aov" | "totalDeductions" | "netPay" | "employerCost") => dec(run.payslips.reduce((s, p) => s + p[k], 0));
    rows.push(["TOTAL", "", "", ...codes.map(() => ""), sum("grossPay"), sum("taxableWage"), sum("wageTax"), sum("aov"), sum("totalDeductions"), sum("netPay"), sum("employerCost")]);
    return csvResponse([header, ...rows], `payroll-journal-${run.year}-${String(run.month).padStart(2, "0")}.csv`);
  });
}
