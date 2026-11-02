import Link from "next/link";
import { db } from "@/lib/db";
import { requireSelf } from "@/lib/server/self-service";
import { getI18n } from "@/lib/server/i18n";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { NoProfile } from "../no-profile";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("me.payslipsTitle") };
}

export default async function MyPayslips() {
  const { employee } = await requireSelf();
  if (!employee) return <NoProfile />;
  const { t, f } = await getI18n();
  const slips = await db.payslip.findMany({ where: { employeeId: employee.id, run: { status: { in: ["APPROVED", "PAID"] } } }, include: { run: true }, orderBy: [{ run: { year: "desc" } }, { run: { month: "desc" } }] });
  return (
    <div>
      <PageHeader title={t("me.payslipsTitle")} />
      <Card>
        {slips.length === 0 ? <EmptyState title={t("me.noPayslips")} description={t("me.payslipsEmptyText")} /> : (
          <Table>
            <THead><TR><TH>{t("me.payslipCols.period")}</TH><TH className="text-right">{t("me.payslipCols.gross")}</TH><TH className="text-right">{t("me.payslipCols.deductions")}</TH><TH className="text-right">{t("me.payslipCols.net")}</TH><TH /></TR></THead>
            <TBody>
              {slips.map((s) => (
                <TR key={s.id}>
                  <TD className="font-medium">{f.period(s.run.year, s.run.month)}</TD>
                  <TD className="tabular text-right">{f.money(s.grossPay, s.calcCurrency)}</TD>
                  <TD className="tabular text-right">{f.money(s.totalDeductions, s.calcCurrency)}</TD>
                  <TD className="tabular text-right font-semibold">{f.money(s.netPayPayment, s.paymentCurrency)}</TD>
                  <TD className="space-x-3 text-right"><Link className="text-primary hover:underline" href={`/me/payslips/${s.id}`}>{t("common.view")}</Link><a className="text-primary hover:underline" href={`/api/payslips/${s.id}/pdf`}>{t("common.pdf")}</a></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
