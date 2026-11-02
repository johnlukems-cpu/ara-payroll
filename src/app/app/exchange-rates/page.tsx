import Link from "next/link";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { getCurrencies, getProviderConfig } from "@/lib/server/rates";
import { can } from "@/lib/permissions";
import { ActionButton } from "@/components/confirm-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { RateTable } from "@/components/rate-table";
import { RateForm } from "@/components/rate-form";
import { addRateAction, fetchCompanyRatesAction } from "@/app/actions/rates";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("rates.title") };
}

export default async function ExchangeRatesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const ctx = await requirePage("payroll.view");
  const { t } = await getI18n();
  const pendingOnly = (await searchParams).status === "PENDING";
  const c = ctx.company;
  const [rates, currencies, provider] = await Promise.all([
    db.exchangeRate.findMany({
      where: { OR: [{ companyId: c.id }, { companyId: null }], ...(pendingOnly ? { status: "PENDING" } : {}) },
      orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
      take: 300,
    }),
    getCurrencies(),
    getProviderConfig(),
  ]);
  const canEdit = can(ctx.role, "payroll.run");
  const policy = t("rates.policy", {
    approval: c.rateRequireApproval ? t("rates.policyApproval") : t("rates.policyNoApproval"),
    api: c.rateAllowApi ? t("rates.policyApi") : t("rates.policyNoApi"),
  });

  return (
    <div>
      <PageHeader
        title={t("rates.title")}
        description={<>{t("rates.subtitle")} <span className="mt-1 block">{policy}{can(ctx.role, "company.manage") && <> · <Link href="/app/settings/currency" className="text-primary hover:underline">{t("rates.changePolicy")}</Link></>}</span></>}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t("rates.title")}</CardTitle>
            <div className="flex gap-1 text-sm">
              <Link href="?" className={`rounded-md px-2.5 py-1 ${!pendingOnly ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted"}`}>{t("rates.filterAll")}</Link>
              <Link href="?status=PENDING" className={`rounded-md px-2.5 py-1 ${pendingOnly ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted"}`}>{t("rates.filterPending")}</Link>
            </div>
          </CardHeader>
          <RateTable rates={rates} canDecide={can(ctx.role, "payroll.approve")} />
        </Card>
        {canEdit && (
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle>{t("rates.addTitle")}</CardTitle><CardDescription>{t("rates.addSub")}</CardDescription></CardHeader>
              <CardContent><RateForm action={addRateAction} currencies={currencies} defaultBase="USD" defaultQuote={c.currency === "USD" ? "SRD" : c.currency} /></CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("rates.fetchTitle")}</CardTitle>
                <CardDescription>{t("rates.fetchSub", { provider: provider.name, approval: c.rateRequireApproval ? "yes" : "no" })}</CardDescription>
              </CardHeader>
              <CardContent>
                {!provider.enabled ? <p className="text-sm text-muted-foreground">{t("rates.providerOff")}</p>
                  : !c.rateAllowApi ? <p className="text-sm text-muted-foreground">{t("rates.apiOff")}</p>
                  : <ActionButton action={fetchCompanyRatesAction} variant="outline">{t("rates.fetch")}</ActionButton>}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
