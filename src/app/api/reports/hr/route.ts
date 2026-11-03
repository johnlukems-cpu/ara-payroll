import { getI18n } from "@/lib/server/i18n";
import { withPermission } from "@/lib/server/route-auth";
import { can } from "@/lib/permissions";
import { HR_REPORTS, hrReport, SALARY_REPORTS, type HrReport } from "@/lib/server/hr-reports";
import { exportFormat, tableResponse } from "@/lib/server/table-export";

/** HR and wage-cost reports as CSV, Excel or PDF (scoped to the active company). */
export async function GET(req: Request) {
  return withPermission("reports.view", async (ctx) => {
    const url = new URL(req.url);
    const kind = url.searchParams.get("kind") as HrReport;
    if (!HR_REPORTS.includes(kind)) return new Response("Not found", { status: 404 });
    if (SALARY_REPORTS.includes(kind) && !can(ctx.role, "employees.viewSalary")) return new Response("Forbidden", { status: 403 });
    const year = Number(url.searchParams.get("year")) || new Date().getUTCFullYear();
    const { t, f } = await getI18n();
    return tableResponse(await hrReport(kind, ctx.company, year, t as never, f), exportFormat(req));
  });
}
