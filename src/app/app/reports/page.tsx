import { Download } from "lucide-react";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { annualStatements, departmentCosts, yearlySummary } from "@/lib/server/reports";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { Alert, EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PayrollTrend } from "@/components/charts/payroll-trend";
import { DepartmentCosts } from "@/components/charts/department-costs";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("reports.title") };
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const ctx = await requirePage("reports.view");
  const { t, f } = await getI18n();
  const now = new Date().getUTCFullYear();
  const year = Number((await searchParams).year) || now;
  const base = ctx.company.currency;
  const [runs, statements, depts] = await Promise.all([
    yearlySummary(ctx.company.id, year),
    annualStatements(ctx.company.id, year),
    departmentCosts(ctx.company.id, year, base, t("reports.unassigned")),
  ]);
  const currencies = [...new Set(runs.map((r) => r.currency))];
  const baseRuns = runs.filter((r) => r.currency === base);
  const sum = (rs: typeof runs, k: "totalGross" | "totalWageTax" | "totalAov" | "totalNet" | "totalEmployer") => rs.reduce((s, r) => s + r[k], 0);

  return (
    <div>
      <PageHeader
        title={t("reports.title")}
        description={t("reports.subtitle")}
        actions={
          <form className="flex gap-2">
            <Select name="year" defaultValue={year} className="w-28" aria-label={t("reports.year")}>
              {Array.from({ length: 6 }, (_, i) => now - i).map((y) => <option key={y}>{y}</option>)}
            </Select>
            <Button variant="secondary" type="submit">{t("common.show")}</Button>
          </form>
        }
      />
      {currencies.length > 1 && <Alert variant="info" className="mb-4">{t("reports.mixedCurrencies")}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("reports.grossYear", { year })} value={f.money(sum(baseRuns, "totalGross"), base)} />
        <Stat label={t("reports.wageTax")} value={f.money(sum(baseRuns, "totalWageTax"), base)} />
        <Stat label={t("reports.aov")} value={f.money(sum(baseRuns, "totalAov"), base)} />
        <Stat label={t("reports.employerTotal")} value={f.money(sum(baseRuns, "totalEmployer"), base)} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>{t("reports.monthly")}</CardTitle><CardDescription>{base}</CardDescription></CardHeader>
          <CardContent>{baseRuns.length ? <PayrollTrend currency={base} data={baseRuns.map((r) => ({ label: f.monthShort(r.month), net: r.totalNet / 100, tax: r.totalWageTax / 100, aov: r.totalAov / 100 }))} /> : <EmptyState title={t("reports.noData")} />}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("reports.deptTitle")}</CardTitle><CardDescription>{t("reports.deptSub")} · {base}</CardDescription></CardHeader>
          <CardContent>{depts.length ? <DepartmentCosts currency={base} data={depts.map((d) => ({ name: d.name, cost: d.cost / 100 }))} /> : <EmptyState title={t("reports.noData")} />}</CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between">
          <div><CardTitle>{t("reports.remitTitle")}</CardTitle><CardDescription>{t("reports.remitSub")}</CardDescription></div>
          <a className={buttonVariants({ variant: "outline", size: "sm" })} href={`/api/reports/tax?year=${year}`}><Download /> {t("common.csv")}</a>
        </CardHeader>
        <Table>
          <THead><TR><TH>{t("reports.cols.month")}</TH><TH>{t("reports.cols.status")}</TH><TH className="text-right">{t("reports.cols.employees")}</TH><TH>{t("reports.cols.currency")}</TH><TH className="text-right">{t("reports.cols.gross")}</TH><TH className="text-right">{t("reports.cols.wageTax")}</TH><TH className="text-right">{t("reports.cols.aov")}</TH><TH className="text-right">{t("reports.cols.remit")}</TH></TR></THead>
          <TBody>
            {runs.map((r) => (
              <TR key={r.id}>
                <TD>{f.month(r.month)}</TD><TD><StatusBadge status={r.status} /></TD>
                <TD className="tabular text-right">{r.employeeCount}</TD>
                <TD>{r.currency}</TD>
                <TD className="tabular text-right">{f.amount(r.totalGross)}</TD>
                <TD className="tabular text-right">{f.amount(r.totalWageTax)}</TD>
                <TD className="tabular text-right">{f.amount(r.totalAov)}</TD>
                <TD className="tabular text-right font-semibold">{f.amount(r.totalWageTax + r.totalAov)}</TD>
              </TR>
            ))}
            {currencies.map((cur) => {
              const rs = runs.filter((r) => r.currency === cur);
              return (
                <TR key={cur} className="bg-muted/50 font-semibold">
                  <TD>{t("common.total")}</TD><TD /><TD /><TD>{cur}</TD>
                  <TD className="tabular text-right">{f.amount(sum(rs, "totalGross"))}</TD>
                  <TD className="tabular text-right">{f.amount(sum(rs, "totalWageTax"))}</TD>
                  <TD className="tabular text-right">{f.amount(sum(rs, "totalAov"))}</TD>
                  <TD className="tabular text-right">{f.amount(sum(rs, "totalWageTax") + sum(rs, "totalAov"))}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between">
          <div><CardTitle>{t("reports.annualTitle", { year })}</CardTitle><CardDescription>{t("reports.annualSub")}</CardDescription></div>
          <a className={buttonVariants({ variant: "outline", size: "sm" })} href={`/api/reports/annual?year=${year}`}><Download /> {t("common.csv")}</a>
        </CardHeader>
        {statements.length === 0 ? <EmptyState title={t("reports.annualEmpty")} /> : (
          <Table>
            <THead><TR><TH>{t("reports.annualCols.employee")}</TH><TH className="text-right">{t("reports.annualCols.months")}</TH><TH className="text-right">{t("reports.annualCols.gross")}</TH><TH className="text-right">{t("reports.annualCols.taxable")}</TH><TH className="text-right">{t("reports.annualCols.wageTax")}</TH><TH className="text-right">{t("reports.annualCols.aov")}</TH><TH className="text-right">{t("reports.annualCols.net")}</TH></TR></THead>
            <TBody>
              {statements.map((s) => (
                <TR key={`${s.employeeId}-${s.currency}`}>
                  <TD className="font-medium">{s.name}<span className="block text-xs font-normal text-muted-foreground">#{s.number} · {s.currency}</span></TD>
                  <TD className="tabular text-right">{s.months}</TD>
                  <TD className="tabular text-right">{f.amount(s.gross)}</TD>
                  <TD className="tabular text-right">{f.amount(s.taxable)}</TD>
                  <TD className="tabular text-right">{f.amount(s.tax)}</TD>
                  <TD className="tabular text-right">{f.amount(s.aov)}</TD>
                  <TD className="tabular text-right font-semibold">{f.amount(s.net)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
