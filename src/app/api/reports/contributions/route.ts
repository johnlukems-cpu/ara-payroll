import { exportFormat, tableResponse } from "@/lib/server/table-export";
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
    if (exportFormat(req) !== "csv") {
      const raw = (x: (typeof r.months)[number] | (typeof r.employees)[number]) => [x.healthEmployee, x.healthEmployer, x.pensionEmployee, x.pensionEmployer, x.fvoEmployee, x.fvoEmployer, x.gross, x.employerCosts, x.employmentCost];
      const perEmployee = new URL(req.url).searchParams.get("part") === "employees";
      return tableResponse(perEmployee
        ? { title: `${t("reports.contrib.title")} ${year} – ${t("reports.contrib.perEmployee")}`, subtitle: ctx.company.name, header: [t("csv.employeeNo"), t("csv.name"), t("csv.currency"), ...head, ...tail], rows: r.employees.map((e) => [e.number, e.name, e.currency, ...raw(e)]), moneyCols: [3, 4, 5, 6, 7, 8, 9, 10, 11], filename: `contributions-employees-${year}` }
        : { title: `${t("reports.contrib.title")} ${year} – ${t("reports.contrib.perPeriod")}`, subtitle: ctx.company.name, header: [t("csv.period"), t("csv.currency"), ...head, ...tail], rows: r.months.map((m) => [f.period(year, m.month), m.currency, ...raw(m)]), moneyCols: [2, 3, 4, 5, 6, 7, 8, 9, 10], filename: `contributions-${year}` }, exportFormat(req));
    }
    const rows: (string | number)[][] = [[t("reports.contrib.perPeriod")], [t("csv.period"), t("csv.currency"), ...head, ...tail]];
    for (const m of r.months) rows.push([f.period(year, m.month), m.currency, ...cols(m)]);
    rows.push([], [t("reports.contrib.perEmployee")], [t("csv.employeeNo"), t("csv.name"), t("csv.currency"), ...head, ...tail]);
    for (const e of r.employees) rows.push([e.number, e.name, e.currency, ...cols(e)]);
    return csvResponse(rows, `contributions-${year}.csv`);
  });
}
