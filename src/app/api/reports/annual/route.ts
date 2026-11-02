import { getI18n } from "@/lib/server/i18n";
import { csvResponse, dec } from "@/lib/server/csv";
import { withPermission } from "@/lib/server/route-auth";
import { annualStatements } from "@/lib/server/reports";

export async function GET(req: Request) {
  return withPermission("reports.view", async (ctx) => {
    const { t } = await getI18n();
    const year = Number(new URL(req.url).searchParams.get("year")) || new Date().getUTCFullYear();
    const list = await annualStatements(ctx.company.id, year);
    const rows: (string | number)[][] = [[t("csv.employeeNo"), t("csv.name"), t("csv.months"), t("csv.currency"), t("csv.grossWages"), t("csv.taxable"), t("csv.taxWithheld"), t("csv.aovWithheld"), t("csv.deductions"), t("csv.netPaidTotal"), t("csv.employerCost")]];
    for (const r of list) rows.push([r.number, r.name, r.months, r.currency, dec(r.gross), dec(r.taxable), dec(r.tax), dec(r.aov), dec(r.deductions), dec(r.net), dec(r.employer)]);
    return csvResponse(rows, `annual-statements-${year}.csv`);
  });
}
