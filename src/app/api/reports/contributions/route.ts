import { getI18n } from "@/lib/server/i18n";
import { csvResponse, dec } from "@/lib/server/csv";
import { withPermission } from "@/lib/server/route-auth";
import { contributionReport } from "@/lib/server/reports";

/** CSV: employee and employer contributions and employer costs per payroll period and per employee (approved/paid payroll). */
export async function GET(req: Request) {
  return withPermission("reports.view", async (ctx) => {
    const { t, f } = await getI18n();
    const year = Number(new URL(req.url).searchParams.get("year")) || new Date().getUTCFullYear();
    const r = await contributionReport(ctx.company.id, year);
    const head = (["health", "pension", "fvo"] as const).flatMap((k) => [`${t(`reports.contrib.${k}`)} – ${t("reports.contrib.employee")}`, `${t(`reports.contrib.${k}`)} – ${t("reports.contrib.employer")}`]);
    const cols = (x: (typeof r.months)[number] | (typeof r.employees)[number]) => [dec(x.healthEmployee), dec(x.healthEmployer), dec(x.pensionEmployee), dec(x.pensionEmployer), dec(x.fvoEmployee), dec(x.fvoEmployer), dec(x.gross), dec(x.employerCosts), dec(x.employmentCost)];
    const tail = [t("csv.grossWages"), t("reports.contrib.employerCosts"), t("reports.contrib.employmentCost")];
    const rows: (string | number)[][] = [[t("reports.contrib.perPeriod")], [t("csv.period"), t("csv.currency"), ...head, ...tail]];
    for (const m of r.months) rows.push([f.period(year, m.month), m.currency, ...cols(m)]);
    rows.push([], [t("reports.contrib.perEmployee")], [t("csv.employeeNo"), t("csv.name"), t("csv.currency"), ...head, ...tail]);
    for (const e of r.employees) rows.push([e.number, e.name, e.currency, ...cols(e)]);
    return csvResponse(rows, `contributions-${year}.csv`);
  });
}
