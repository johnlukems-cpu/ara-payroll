import { db } from "@/lib/db";
import { getI18n } from "@/lib/server/i18n";
import { audit } from "@/lib/server/audit";
import { csvResponse, dec } from "@/lib/server/csv";
import { notFound, withPermission } from "@/lib/server/route-auth";

/** Salary payment instructions in each employee's payment currency, grouped by currency and bank. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return withPermission("payroll.approve", async (ctx) => {
    const { id } = await params;
    const run = await db.payrollRun.findFirst({ where: { id, companyId: ctx.company.id, status: { in: ["APPROVED", "PAID"] } }, include: { company: true, payslips: { orderBy: [{ paymentCurrency: "asc" }, { bankName: "asc" }, { employeeName: "asc" }] } } });
    if (!run) return notFound();
    const { t } = await getI18n();
    const ref = `${t("csv.salaryRef")} ${run.year}-${String(run.month).padStart(2, "0")}`;
    const rows: (string | number | null)[][] = [[t("csv.debitAccount"), t("csv.beneficiaryBank"), t("csv.beneficiaryAccount"), t("csv.beneficiaryName"), t("csv.amount"), t("csv.currency"), t("csv.reference"), t("csv.executionDate")]];
    for (const p of run.payslips.filter((x) => x.netPayPayment > 0)) {
      rows.push([run.company.bankAccount, p.bankName ?? "UNKNOWN", p.bankAccount ?? "MISSING", p.employeeName, dec(p.netPayPayment), p.paymentCurrency, `${ref} ${p.employeeNumber}`, run.payDate.toISOString().slice(0, 10)]);
    }
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "payroll.bank_file_exported", entity: "PayrollRun", entityId: run.id });
    return csvResponse(rows, `salary-payments-${run.year}-${String(run.month).padStart(2, "0")}.csv`);
  });
}
