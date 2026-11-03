import { exportFormat, tableResponse } from "@/lib/server/table-export";
import { getI18n } from "@/lib/server/i18n";
import { csvResponse, dec } from "@/lib/server/csv";
import { withPermission } from "@/lib/server/route-auth";
import { yearlySummary } from "@/lib/server/reports";

export async function GET(req: Request) {
  return withPermission("reports.view", async (ctx) => {
    const { t, f } = await getI18n();
    const year = Number(new URL(req.url).searchParams.get("year")) || new Date().getUTCFullYear();
    const runs = await yearlySummary(ctx.company.id, year);
    const rows: (string | number)[][] = [[t("csv.company"), ctx.company.name, t("csv.taxNo"), ctx.company.taxNumber ?? ""], [], [t("csv.month"), t("csv.status"), t("csv.employees"), t("csv.currency"), t("csv.grossWages"), t("csv.wageTaxLb"), t("csv.aovPremium"), t("csv.remit")]];
    for (const r of runs) rows.push([f.month(r.month), t(`status.${r.status}`), r.employeeCount, r.currency, dec(r.totalGross), dec(r.totalWageTax), dec(r.totalAov), dec(r.totalWageTax + r.totalAov)]);
    for (const cur of [...new Set(runs.map((r) => r.currency))]) {
      const rs = runs.filter((r) => r.currency === cur);
      const s = (k: "totalGross" | "totalWageTax" | "totalAov") => rs.reduce((a, r) => a + r[k], 0);
      rows.push([t("csv.total"), "", "", cur, dec(s("totalGross")), dec(s("totalWageTax")), dec(s("totalAov")), dec(s("totalWageTax") + s("totalAov"))]);
    }
    if (exportFormat(req) !== "csv") {
      const body = runs.map((r) => [f.month(r.month), t(`status.${r.status}`), r.employeeCount, r.currency, r.totalGross, r.totalWageTax, r.totalAov, r.totalWageTax + r.totalAov]);
      for (const cur of [...new Set(runs.map((r) => r.currency))]) {
        const rs = runs.filter((r) => r.currency === cur);
        const s = (k: "totalGross" | "totalWageTax" | "totalAov") => rs.reduce((a, r) => a + r[k], 0);
        body.push([t("csv.total"), "", "", cur, s("totalGross"), s("totalWageTax"), s("totalAov"), s("totalWageTax") + s("totalAov")]);
      }
      return tableResponse({ title: `${t("reports.remitTitle")} ${year}`, subtitle: `${ctx.company.name}${ctx.company.taxNumber ? ` · ${t("csv.taxNo")} ${ctx.company.taxNumber}` : ""}`, header: rows[2] as string[], rows: body, moneyCols: [4, 5, 6, 7], filename: `wage-tax-aov-${year}` }, exportFormat(req));
    }
    return csvResponse(rows, `wage-tax-aov-${year}.csv`);
  });
}
