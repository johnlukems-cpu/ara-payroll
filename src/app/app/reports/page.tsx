import { Download } from "lucide-react";
import { requirePage } from "@/lib/server/auth";
import { annualStatements, departmentCosts, yearlySummary } from "@/lib/server/reports";
import { amount, money, MONTHS } from "@/lib/format";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PayrollTrend } from "@/components/charts/payroll-trend";
import { DepartmentCosts } from "@/components/charts/department-costs";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const ctx = await requirePage("reports.view");
  const now = new Date().getUTCFullYear();
  const year = Number((await searchParams).year) || now;
  const [runs, statements, depts] = await Promise.all([
    yearlySummary(ctx.company.id, year),
    annualStatements(ctx.company.id, year),
    departmentCosts(ctx.company.id, year),
  ]);
  const t = (k: "totalGross" | "totalWageTax" | "totalAov" | "totalNet" | "totalEmployer") => runs.reduce((s, r) => s + r[k], 0);

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Payroll totals, statutory remittances and annual statements."
        actions={
          <form className="flex gap-2">
            <Select name="year" defaultValue={year} className="w-28" aria-label="Year">
              {Array.from({ length: 6 }, (_, i) => now - i).map((y) => <option key={y}>{y}</option>)}
            </Select>
            <Button variant="secondary" type="submit">Show</Button>
          </form>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={`Gross wages ${year}`} value={money(t("totalGross"))} />
        <Stat label="Wage tax" value={money(t("totalWageTax"))} />
        <Stat label="AOV" value={money(t("totalAov"))} />
        <Stat label="Total employer cost" value={money(t("totalEmployer"))} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Monthly overview</CardTitle></CardHeader>
          <CardContent>{runs.length ? <PayrollTrend data={runs.map((r) => ({ label: MONTHS[r.month - 1].slice(0, 3), net: r.totalNet / 100, tax: r.totalWageTax / 100, aov: r.totalAov / 100 }))} /> : <EmptyState title="No payroll data for this year" />}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Cost by department</CardTitle><CardDescription>Approved and paid runs</CardDescription></CardHeader>
          <CardContent>{depts.length ? <DepartmentCosts data={depts.map((d) => ({ name: d.name, cost: d.cost / 100 }))} /> : <EmptyState title="No data" />}</CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between">
          <div><CardTitle>Wage tax & AOV remittance</CardTitle><CardDescription>Monthly amounts withheld, for filing the wage tax return with the Belastingdienst.</CardDescription></div>
          <a className={buttonVariants({ variant: "outline", size: "sm" })} href={`/api/reports/tax?year=${year}`}><Download /> CSV</a>
        </CardHeader>
        <Table>
          <THead><TR><TH>Month</TH><TH>Status</TH><TH className="text-right">Employees</TH><TH className="text-right">Gross wages</TH><TH className="text-right">Wage tax</TH><TH className="text-right">AOV</TH><TH className="text-right">Total to remit</TH></TR></THead>
          <TBody>
            {runs.map((r) => (
              <TR key={r.id}>
                <TD>{MONTHS[r.month - 1]}</TD><TD><StatusBadge status={r.status} /></TD>
                <TD className="tabular text-right">{r.employeeCount}</TD>
                <TD className="tabular text-right">{amount(r.totalGross)}</TD>
                <TD className="tabular text-right">{amount(r.totalWageTax)}</TD>
                <TD className="tabular text-right">{amount(r.totalAov)}</TD>
                <TD className="tabular text-right font-semibold">{amount(r.totalWageTax + r.totalAov)}</TD>
              </TR>
            ))}
            {runs.length > 0 && (
              <TR className="bg-muted/50 font-semibold">
                <TD>Total</TD><TD /><TD /><TD className="tabular text-right">{amount(t("totalGross"))}</TD><TD className="tabular text-right">{amount(t("totalWageTax"))}</TD><TD className="tabular text-right">{amount(t("totalAov"))}</TD><TD className="tabular text-right">{amount(t("totalWageTax") + t("totalAov"))}</TD>
              </TR>
            )}
          </TBody>
        </Table>
      </Card>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between">
          <div><CardTitle>Annual statements {year}</CardTitle><CardDescription>Per-employee year totals (approved and paid runs).</CardDescription></div>
          <a className={buttonVariants({ variant: "outline", size: "sm" })} href={`/api/reports/annual?year=${year}`}><Download /> CSV</a>
        </CardHeader>
        {statements.length === 0 ? <EmptyState title="No approved payroll this year" /> : (
          <Table>
            <THead><TR><TH>Employee</TH><TH className="text-right">Months</TH><TH className="text-right">Gross</TH><TH className="text-right">Taxable</TH><TH className="text-right">Wage tax</TH><TH className="text-right">AOV</TH><TH className="text-right">Net</TH></TR></THead>
            <TBody>
              {statements.map((s) => (
                <TR key={s.employeeId}>
                  <TD className="font-medium">{s.name}<span className="block text-xs font-normal text-muted-foreground">#{s.number}</span></TD>
                  <TD className="tabular text-right">{s.months}</TD>
                  <TD className="tabular text-right">{amount(s.gross)}</TD>
                  <TD className="tabular text-right">{amount(s.taxable)}</TD>
                  <TD className="tabular text-right">{amount(s.tax)}</TD>
                  <TD className="tabular text-right">{amount(s.aov)}</TD>
                  <TD className="tabular text-right font-semibold">{amount(s.net)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
