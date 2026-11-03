import Link from "next/link";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { can } from "@/lib/permissions";
import { HR_REPORTS, hrReport, SALARY_REPORTS, type HrReport } from "@/lib/server/hr-reports";
import { ExportLinks } from "@/components/export-links";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("hrReports.title") };
}

/** HR and wage-cost reports with preview and CSV / Excel / PDF export. */
export default async function HrReportsPage({ searchParams }: { searchParams: Promise<{ kind?: string; year?: string }> }) {
  const ctx = await requirePage("reports.view");
  const { t, f } = await getI18n();
  const sp = await searchParams;
  const allowed = HR_REPORTS.filter((k) => !SALARY_REPORTS.includes(k) || can(ctx.role, "employees.viewSalary"));
  const kind: HrReport = allowed.includes(sp.kind as HrReport) ? (sp.kind as HrReport) : "roster";
  const year = Number(sp.year) >= 2000 && Number(sp.year) <= 2100 ? Number(sp.year) : new Date().getUTCFullYear();
  const tbl = await hrReport(kind, ctx.company, year, t as never, f);
  const money = new Set(tbl.moneyCols ?? []);
  const cur = kind === "costs" ? 3 : -1;

  return (
    <div className="space-y-6">
      <PageHeader title={t("hrReports.title")} description={t("hrReports.subtitle")} actions={<Link href="/app/reports" className="text-sm text-primary hover:underline">{t("hrReports.toPayrollReports")}</Link>} />
      <div className="flex flex-wrap gap-2" data-testid="hr-report-kinds">
        {allowed.map((k) => <Link key={k} href={`?kind=${k}&year=${year}`} className={cn(buttonVariants({ variant: k === kind ? "default" : "outline", size: "sm" }))}>{t(`hrReports.${k}.title`)}</Link>)}
      </div>
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div><CardTitle>{tbl.title}</CardTitle><CardDescription>{tbl.subtitle}</CardDescription></div>
          <div className="flex flex-wrap items-center gap-2">
            <form className="flex gap-2"><input type="hidden" name="kind" value={kind} /><Input name="year" type="number" min={2000} max={2100} defaultValue={year} className="w-24" aria-label={t("leave.overview.year")} /><Button type="submit" variant="secondary" size="sm">{t("common.show")}</Button></form>
            <ExportLinks href={`/api/reports/hr?kind=${kind}&year=${year}`} />
          </div>
        </CardHeader>
        {tbl.rows.length === 0 ? <EmptyState title={t("reports.noData")} /> : (
          <Table data-testid={`hr-report-${kind}`}>
            <THead><TR>{tbl.header.map((h, i) => <TH key={i} className={money.has(i) || typeof tbl.rows[0][i] === "number" ? "text-right" : undefined}>{h}</TH>)}</TR></THead>
            <TBody>
              {tbl.rows.map((r, ri) => (
                <TR key={ri}>{r.map((v, i) => <TD key={i} className={cn("text-sm", (money.has(i) || typeof v === "number") && "tabular text-right")}>{money.has(i) && typeof v === "number" ? f.money(v, String(r[cur] ?? ctx.company.currency)) : v ?? ""}</TD>)}</TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
