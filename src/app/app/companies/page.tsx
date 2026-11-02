import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { getCurrencies } from "@/lib/server/rates";
import { can } from "@/lib/permissions";
import { ActionForm, FieldError } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { CurrencySelect } from "@/components/currency-select";
import { PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { switchCompanyAction } from "@/app/actions/auth";
import { createCompanyAction } from "@/app/actions/settings";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("companies.title") };
}

export default async function CompaniesPage() {
  const ctx = await requirePage();
  const { t } = await getI18n();
  const [counts, currencies] = await Promise.all([
    db.employee.groupBy({ by: ["companyId"], where: { companyId: { in: ctx.memberships.map((m) => m.companyId) }, status: { not: "TERMINATED" } }, _count: true }),
    getCurrencies(),
  ]);
  return (
    <div>
      <PageHeader title={t("companies.title")} description={t("companies.subtitle")} />
      <Card>
        <Table>
          <THead><TR><TH>{t("companies.cols.company")}</TH><TH>{t("companies.cols.role")}</TH><TH>{t("companies.cols.currency")}</TH><TH className="text-right">{t("companies.cols.employees")}</TH><TH /></TR></THead>
          <TBody>
            {ctx.memberships.map((m) => (
              <TR key={m.id}>
                <TD className="font-medium">{m.company.name} {m.companyId === ctx.company.id && <Badge variant="accent" className="ml-1">{t("companies.activeBadge")}</Badge>}</TD>
                <TD>{t(`roles.${m.role}`)}</TD>
                <TD>{m.company.currency}</TD>
                <TD className="tabular text-right">{counts.find((c) => c.companyId === m.companyId)?._count ?? 0}</TD>
                <TD className="text-right">
                  {m.companyId !== ctx.company.id && (
                    <form action={switchCompanyAction}><input type="hidden" name="companyId" value={m.companyId} /><button className="text-sm text-primary hover:underline">{t("common.switch")}</button></form>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      {can(ctx.role, "company.manage") && (
        <Card className="mt-6 max-w-2xl">
          <CardHeader><CardTitle>{t("companies.addTitle")}</CardTitle><CardDescription>{t("companies.addSub")}</CardDescription></CardHeader>
          <CardContent>
            <ActionForm action={createCompanyAction} className="flex flex-wrap gap-2" resetOnSuccess>
              <div className="min-w-56 flex-1"><Input name="name" placeholder={t("companies.placeholder")} aria-label={t("companies.placeholder")} /><FieldError name="name" /></div>
              <CurrencySelect name="currency" currencies={currencies} defaultValue="SRD" className="w-64" aria-label={t("auth.baseCurrency")} />
              <SubmitButton>{t("common.create")}</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
