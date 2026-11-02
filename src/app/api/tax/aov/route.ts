import { db } from "@/lib/db";
import { getI18n } from "@/lib/server/i18n";
import { csvResponse, dec } from "@/lib/server/csv";
import { notFound, withPermission } from "@/lib/server/route-auth";

/** AOV report for a period: company, employees with ID number, calculation base and premium. */
export async function GET(req: Request) {
  return withPermission("tax.view", async (ctx) => {
    const url = new URL(req.url);
    const year = Number(url.searchParams.get("year"));
    const month = Number(url.searchParams.get("month"));
    const run = await db.payrollRun.findFirst({ where: { companyId: ctx.company.id, year, month } });
    if (!run) return notFound();
    const { t, f } = await getI18n();
    const slips = await db.payslip.findMany({ where: { runId: run.id }, include: { employee: { select: { idNumber: true } } }, orderBy: { employeeNumber: "asc" } });
    const rows: (string | number | null)[][] = [
      [t("decl.file.company"), ctx.company.legalName ?? ctx.company.name], [t("decl.file.taxNumber"), ctx.company.taxNumber ?? ""], [t("decl.file.kkf"), ctx.company.kkfNumber ?? ""],
      [t("decl.file.period"), f.period(year, month)], [t("decl.file.status"), t(`status.${run.status}`)], [],
      [t("decl.file.colNumber"), t("decl.file.colName"), t("decl.file.colIdNumber"), t("decl.file.currency"), t("decl.file.colAovBase"), t("decl.file.colAov"), t("decl.file.colAovEmployer")],
      ...slips.map((s) => [s.employeeNumber, s.employeeName, s.employee.idNumber, s.calcCurrency, dec(s.aovBaseAmount), dec(s.aov), dec(s.aovEmployer)]),
      [t("decl.file.total"), "", "", slips[0]?.calcCurrency ?? "", dec(slips.reduce((a, s) => a + s.aovBaseAmount, 0)), dec(slips.reduce((a, s) => a + s.aov, 0)), dec(slips.reduce((a, s) => a + s.aovEmployer, 0))],
    ];
    return csvResponse(rows, `ARA_AOV_${ctx.company.name.replace(/[^A-Za-z0-9]+/g, "")}_${year}-${String(month).padStart(2, "0")}.csv`);
  });
}
