import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { getCurrencies, getProviderConfig } from "@/lib/server/rates";
import { ActionForm, FieldError } from "@/components/action-form";
import { ActionButton } from "@/components/confirm-button";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { CurrencySelect } from "@/components/currency-select";
import { PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { RateTable } from "@/components/rate-table";
import { RateForm } from "@/components/rate-form";
import { addPlatformRateAction, fetchPlatformRatesAction, saveProviderAction, toggleCurrencyAction } from "@/app/actions/rates";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("admin.title") };
}

export default async function AdminPage() {
  const ctx = await requirePage();
  if (!ctx.user.isPlatformAdmin) redirect("/app?denied=1");
  const { t, locale } = await getI18n();
  const [all, active, provider, rates] = await Promise.all([
    getCurrencies(false),
    getCurrencies(),
    getProviderConfig(),
    db.exchangeRate.findMany({ where: { companyId: null }, orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }], take: 100 }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title={t("admin.title")} description={t("admin.subtitle")} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t("admin.currencies")}</CardTitle><CardDescription>{t("admin.currenciesSub")}</CardDescription></CardHeader>
          <Table>
            <THead><TR><TH>{t("admin.cols.code")}</TH><TH>{t("admin.cols.name")}</TH><TH>{t("admin.cols.symbol")}</TH><TH>{t("admin.cols.decimals")}</TH><TH>{t("admin.cols.status")}</TH><TH /></TR></THead>
            <TBody>
              {all.map((c) => (
                <TR key={c.code}>
                  <TD className="font-semibold">{c.code}</TD>
                  <TD>{locale === "nl" ? c.nameNl : c.name}</TD>
                  <TD>{c.symbol}</TD>
                  <TD>{c.decimals}</TD>
                  <TD><Badge variant={c.isActive ? "success" : "muted"}>{c.isActive ? t("common.active") : t("common.inactive")}</Badge></TD>
                  <TD className="text-right"><ActionButton action={toggleCurrencyAction} fields={{ code: c.code }} size="sm" variant="ghost">{c.isActive ? t("admin.deactivate") : t("admin.activate")}</ActionButton></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("admin.providerTitle")}</CardTitle><CardDescription>{t("admin.providerSub")}</CardDescription></CardHeader>
          <CardContent>
            <ActionForm action={saveProviderAction} className="space-y-3">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={provider.enabled} /> {t("admin.enabled")}</label>
              <Field label={t("admin.providerName")} htmlFor="pname"><Input id="pname" name="name" defaultValue={provider.name} /><FieldError name="name" /></Field>
              <Field label={t("admin.url")} htmlFor="url" hint={t("admin.urlHint", { base: "{base}", apiKey: "{apiKey}" })}><Input id="url" name="url" defaultValue={provider.url} /><FieldError name="url" /></Field>
              <Field label={t("admin.apiKey")} htmlFor="apiKey" hint={t("admin.apiKeyHint")}><Input id="apiKey" name="apiKey" type="password" autoComplete="off" placeholder={provider.apiKey ? "••••••••" : ""} /></Field>
              <SubmitButton>{t("admin.save")}</SubmitButton>
            </ActionForm>
            {provider.enabled && (
              <ActionForm action={fetchPlatformRatesAction} className="mt-6 flex items-end gap-2 border-t pt-4">
                <Field label={t("rates.base")} htmlFor="fbase"><CurrencySelect id="fbase" name="baseCurrency" currencies={active} defaultValue="USD" /></Field>
                <SubmitButton variant="outline">{t("rates.fetch")}</SubmitButton>
              </ActionForm>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>{t("admin.platformRates")}</CardTitle><CardDescription>{t("admin.platformRatesSub")}</CardDescription></CardHeader>
          <RateTable rates={rates} canDecide={false} />
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("rates.addTitle")}</CardTitle><CardDescription>{t("rates.addSub")}</CardDescription></CardHeader>
          <CardContent><RateForm action={addPlatformRateAction} currencies={active} defaultBase="USD" defaultQuote="SRD" /></CardContent>
        </Card>
      </div>
    </div>
  );
}
