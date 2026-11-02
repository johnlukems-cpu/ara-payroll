import { csvResponse, dec } from "@/lib/server/csv";
import { withPermission } from "@/lib/server/route-auth";
import { yearlySummary } from "@/lib/server/reports";
import { MONTHS } from "@/lib/format";

export async function GET(req: Request) {
  return withPermission("reports.view", async (ctx) => {
    const year = Number(new URL(req.url).searchParams.get("year")) || new Date().getUTCFullYear();
    const runs = await yearlySummary(ctx.company.id, year);
    const rows: (string | number)[][] = [["Company", ctx.company.name, "Tax no.", ctx.company.taxNumber ?? ""], [], ["Month", "Status", "Employees", "Gross wages", "Wage tax (loonbelasting)", "AOV premium", "Total to remit"]];
    for (const r of runs) rows.push([MONTHS[r.month - 1], r.status, r.employeeCount, dec(r.totalGross), dec(r.totalWageTax), dec(r.totalAov), dec(r.totalWageTax + r.totalAov)]);
    const t = (k: "totalGross" | "totalWageTax" | "totalAov") => runs.reduce((s, r) => s + r[k], 0);
    rows.push(["TOTAL", "", "", dec(t("totalGross")), dec(t("totalWageTax")), dec(t("totalAov")), dec(t("totalWageTax") + t("totalAov"))]);
    return csvResponse(rows, `wage-tax-aov-summary-${year}.csv`);
  });
}
