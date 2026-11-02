import Link from "next/link";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { getCurrencies } from "@/lib/server/rates";
import { ActionForm, FieldError } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { CurrencySelect } from "@/components/currency-select";
import { Alert } from "@/components/ui/misc";
import { buttonVariants } from "@/components/ui/button";
import { changeBaseCurrencyAction, saveRatePolicyAction } from "@/app/actions/settings";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("settings.tabs.currency") };
}

export default async function CurrencySettings() {
  const ctx = await requirePage("company.manage");
  const { t } = await getI18n();
  const currencies = (await getCurrencies()).filter((c) => c.code !== ctx.company.currency);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.currency.baseTitle")}</CardTitle>
          <CardDescription>{t("settings.currency.baseText", { currency: ctx.company.currency, company: ctx.company.name })}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-4xl font-semibold tracking-tight text-primary">{ctx.company.currency}</p>
          <Alert variant="warning" className="mb-4">{t("settings.currency.changeText")}</Alert>
          <ActionForm action={changeBaseCurrencyAction} className="space-y-3">
            <p className="text-sm font-semibold">{t("settings.currency.changeTitle")}</p>
            <Field label={t("settings.currency.newBase")} htmlFor="currency"><CurrencySelect id="currency" name="currency" currencies={currencies} /><FieldError name="currency" /></Field>
            <Field label={t("settings.currency.reason")} htmlFor="reason"><Textarea id="reason" name="reason" /><FieldError name="reason" /></Field>
            <Field label={t("settings.currency.confirmName")} htmlFor="confirmName" hint={ctx.company.name}><Input id="confirmName" name="confirmName" autoComplete="off" /><FieldError name="confirmName" /></Field>
            <SubmitButton variant="destructive">{t("settings.currency.change")}</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.currency.policyTitle")}</CardTitle>
          <CardDescription>{t("settings.currency.policyText")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={saveRatePolicyAction} className="space-y-4">
            <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="rateRequireApproval" defaultChecked={ctx.company.rateRequireApproval} className="mt-0.5" /> {t("settings.currency.requireApproval")}</label>
            <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="rateAllowApi" defaultChecked={ctx.company.rateAllowApi} className="mt-0.5" /> {t("settings.currency.allowApi")}</label>
            <div className="flex flex-wrap gap-2">
              <SubmitButton>{t("settings.currency.savePolicy")}</SubmitButton>
              <Link href="/app/exchange-rates" className={buttonVariants({ variant: "outline" })}>{t("settings.currency.manageRates")}</Link>
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
