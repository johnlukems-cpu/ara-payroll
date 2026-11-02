import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { can } from "@/lib/permissions";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("nav.payroll") };
}

export default async function PayrollPage() {
  const ctx = await requirePage("payroll.view");
  const { t, f } = await getI18n();
  const runs = await db.payrollRun.findMany({ where: { companyId: ctx.company.id }, orderBy: [{ year: "desc" }, { month: "desc" }] });
  return (
    <div>
      <PageHeader
        title={t("payroll.title")}
        description={t("payroll.subtitle")}
        actions={can(ctx.role, "payroll.run") && <Link href="/app/payroll/new" className={buttonVariants({ variant: "accent" })}><Plus /> {t("payroll.newRun")}</Link>}
      />
      <Card>
        {runs.length === 0 ? (
          <EmptyState title={t("payroll.noRuns")} description={t("payroll.noRunsText")} />
        ) : (
          <Table>
            <THead><TR><TH>{t("payroll.cols.period")}</TH><TH>{t("payroll.cols.payDate")}</TH><TH>{t("payroll.cols.status")}</TH><TH className="text-right">{t("payroll.cols.employees")}</TH><TH className="text-right">{t("payroll.cols.gross")}</TH><TH className="text-right">{t("payroll.cols.wageTax")}</TH><TH className="text-right">{t("payroll.cols.aov")}</TH><TH className="text-right">{t("payroll.cols.net")}</TH></TR></THead>
            <TBody>
              {runs.map((r) => (
                <TR key={r.id}>
                  <TD><Link href={`/app/payroll/${r.id}`} className="font-medium text-primary hover:underline">{f.period(r.year, r.month)}</Link></TD>
                  <TD className="tabular">{f.date(r.payDate)}</TD>
                  <TD><StatusBadge status={r.status} /></TD>
                  <TD className="tabular text-right">{r.employeeCount}</TD>
                  <TD className="tabular text-right">{f.money(r.totalGross, r.currency)}</TD>
                  <TD className="tabular text-right">{f.money(r.totalWageTax, r.currency)}</TD>
                  <TD className="tabular text-right">{f.money(r.totalAov, r.currency)}</TD>
                  <TD className="tabular text-right font-medium">{f.money(r.totalNet, r.currency)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
