import { db } from "@/lib/db";
import { getI18n } from "@/lib/server/i18n";
import { csvResponse, dec } from "@/lib/server/csv";
import { notFound, withPermission } from "@/lib/server/route-auth";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return withPermission("payroll.view", async (ctx) => {
    const { id } = await params;
    const run = await db.payrollRun.findFirst({ where: { id, companyId: ctx.company.id }, include: { payslips: { include: { lines: true }, orderBy: { employeeName: "asc" } } } });
    if (!run) return notFound();
    const { t } = await getI18n();
    const codes = [...new Set(run.payslips.flatMap((p) => p.lines.map((l) => `${l.type}:${l.code}`)))];
    const header = [t("csv.employeeNo"), t("csv.name"), t("csv.department"), t("csv.currency"), ...codes.map((c) => c.split(":")[1]), t("csv.gross"), t("csv.taxable"), t("csv.wageTax"), t("csv.aov"), t("csv.deductions"), t("csv.net"), t("csv.employerCost"), t("csv.paymentCurrency"), t("csv.netPaid")];
    const rows: (string | number | null)[][] = run.payslips.map((p) => {
      const byCode = new Map<string, number>();
      for (const l of p.lines) byCode.set(`${l.type}:${l.code}`, (byCode.get(`${l.type}:${l.code}`) ?? 0) + l.amount);
      return [p.employeeNumber, p.employeeName, p.department, p.calcCurrency, ...codes.map((c) => dec(byCode.get(c) ?? 0)), dec(p.grossPay), dec(p.taxableWage), dec(p.wageTax), dec(p.aov), dec(p.totalDeductions), dec(p.netPay), dec(p.employerCost), p.paymentCurrency, dec(p.netPayPayment)];
    });
    const sum = (k: "grossPay" | "taxableWage" | "wageTax" | "aov" | "totalDeductions" | "netPay" | "employerCost") => dec(run.payslips.reduce((s, p) => s + p[k], 0));
    rows.push([t("csv.total"), "", "", run.payslips[0]?.calcCurrency ?? "", ...codes.map(() => ""), sum("grossPay"), sum("taxableWage"), sum("wageTax"), sum("aov"), sum("totalDeductions"), sum("netPay"), sum("employerCost"), "", ""]);
    return csvResponse([header, ...rows], `payroll-journal-${run.year}-${String(run.month).padStart(2, "0")}.csv`);
  });
}
