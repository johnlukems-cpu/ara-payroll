import { db } from "@/lib/db";
import { audit } from "@/lib/server/audit";
import { csvResponse, dec } from "@/lib/server/csv";
import { notFound, withPermission } from "@/lib/server/route-auth";

/** Salary payment instruction file, grouped by beneficiary bank. Import into the company's online banking. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return withPermission("payroll.approve", async (ctx) => {
    const { id } = await params;
    const run = await db.payrollRun.findFirst({ where: { id, companyId: ctx.company.id, status: { in: ["APPROVED", "PAID"] } }, include: { company: true, payslips: { orderBy: [{ bankName: "asc" }, { employeeName: "asc" }] } } });
    if (!run) return notFound();
    const ref = `SAL ${run.year}-${String(run.month).padStart(2, "0")}`;
    const rows: (string | number | null)[][] = [["Debit account", "Beneficiary bank", "Beneficiary account", "Beneficiary name", "Amount", "Currency", "Reference", "Execution date"]];
    for (const p of run.payslips.filter((x) => x.netPay > 0)) {
      rows.push([run.company.bankAccount, p.bankName ?? "UNKNOWN", p.bankAccount ?? "MISSING", p.employeeName, dec(p.netPay), run.company.currency, `${ref} ${p.employeeNumber}`, run.payDate.toISOString().slice(0, 10)]);
    }
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "payroll.bank_file_exported", entity: "PayrollRun", entityId: run.id });
    return csvResponse(rows, `salary-payments-${run.year}-${String(run.month).padStart(2, "0")}.csv`);
  });
}
