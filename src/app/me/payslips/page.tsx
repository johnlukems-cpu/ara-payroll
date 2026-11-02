import Link from "next/link";
import { db } from "@/lib/db";
import { requireSelf } from "@/lib/server/self-service";
import { money, periodLabel } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { NoProfile } from "../no-profile";

export const metadata = { title: "My payslips" };

export default async function MyPayslips() {
  const { employee } = await requireSelf();
  if (!employee) return <NoProfile />;
  const slips = await db.payslip.findMany({ where: { employeeId: employee.id, run: { status: { in: ["APPROVED", "PAID"] } } }, include: { run: true }, orderBy: [{ run: { year: "desc" } }, { run: { month: "desc" } }] });
  return (
    <div>
      <PageHeader title="My payslips" />
      <Card>
        {slips.length === 0 ? <EmptyState title="No payslips yet" description="Payslips appear here once payroll has been approved." /> : (
          <Table>
            <THead><TR><TH>Period</TH><TH className="text-right">Gross</TH><TH className="text-right">Deductions</TH><TH className="text-right">Net pay</TH><TH /></TR></THead>
            <TBody>
              {slips.map((s) => (
                <TR key={s.id}>
                  <TD className="font-medium">{periodLabel(s.run.year, s.run.month)}</TD>
                  <TD className="tabular text-right">{money(s.grossPay)}</TD>
                  <TD className="tabular text-right">{money(s.totalDeductions)}</TD>
                  <TD className="tabular text-right font-semibold">{money(s.netPay)}</TD>
                  <TD className="text-right space-x-3"><Link className="text-primary hover:underline" href={`/me/payslips/${s.id}`}>View</Link><a className="text-primary hover:underline" href={`/api/payslips/${s.id}/pdf`}>PDF</a></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
