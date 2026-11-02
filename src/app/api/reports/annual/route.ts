import { csvResponse, dec } from "@/lib/server/csv";
import { withPermission } from "@/lib/server/route-auth";
import { annualStatements } from "@/lib/server/reports";

export async function GET(req: Request) {
  return withPermission("reports.view", async (ctx) => {
    const year = Number(new URL(req.url).searchParams.get("year")) || new Date().getUTCFullYear();
    const list = await annualStatements(ctx.company.id, year);
    const rows: (string | number)[][] = [["Employee no.", "Name", "Months", "Gross wages", "Taxable wage", "Wage tax withheld", "AOV withheld", "Total deductions", "Net paid", "Employer cost"]];
    for (const r of list) rows.push([r.number, r.name, r.months, dec(r.gross), dec(r.taxable), dec(r.tax), dec(r.aov), dec(r.deductions), dec(r.net), dec(r.employer)]);
    return csvResponse(rows, `annual-statements-${year}.csv`);
  });
}
