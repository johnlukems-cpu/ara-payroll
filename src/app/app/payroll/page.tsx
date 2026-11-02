import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { can } from "@/lib/permissions";
import { date, money, periodLabel } from "@/lib/format";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const metadata = { title: "Payroll" };

export default async function PayrollPage() {
  const ctx = await requirePage("payroll.view");
  const runs = await db.payrollRun.findMany({ where: { companyId: ctx.company.id }, orderBy: [{ year: "desc" }, { month: "desc" }] });
  return (
    <div>
      <PageHeader
        title="Payroll runs"
        description="Monthly payroll periods: enter inputs, calculate, review, approve and pay."
        actions={can(ctx.role, "payroll.run") && <Link href="/app/payroll/new" className={buttonVariants({ variant: "accent" })}><Plus /> New payroll run</Link>}
      />
      <Card>
        {runs.length === 0 ? (
          <EmptyState title="No payroll runs yet" description="Create a payroll run for the current month to calculate salaries and generate payslips." />
        ) : (
          <Table>
            <THead><TR><TH>Period</TH><TH>Pay date</TH><TH>Status</TH><TH className="text-right">Employees</TH><TH className="text-right">Gross</TH><TH className="text-right">Wage tax</TH><TH className="text-right">AOV</TH><TH className="text-right">Net</TH></TR></THead>
            <TBody>
              {runs.map((r) => (
                <TR key={r.id}>
                  <TD><Link href={`/app/payroll/${r.id}`} className="font-medium text-primary hover:underline">{periodLabel(r.year, r.month)}</Link></TD>
                  <TD className="tabular">{date(r.payDate)}</TD>
                  <TD><StatusBadge status={r.status} /></TD>
                  <TD className="tabular text-right">{r.employeeCount}</TD>
                  <TD className="tabular text-right">{money(r.totalGross)}</TD>
                  <TD className="tabular text-right">{money(r.totalWageTax)}</TD>
                  <TD className="tabular text-right">{money(r.totalAov)}</TD>
                  <TD className="tabular text-right font-medium">{money(r.totalNet)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
