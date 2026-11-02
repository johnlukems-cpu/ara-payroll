import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ActionForm, FieldError } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Field, Input } from "@/components/ui/form";
import { CurrencySelect } from "@/components/currency-select";
import { registerAction } from "@/app/actions/auth";
import { getCurrencies } from "@/lib/server/rates";
import { AuthShell } from "../auth-shell";

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("auth.registerTitle") };
}

export default async function RegisterPage() {
  const t = await getTranslations();
  const currencies = await getCurrencies();
  return (
    <AuthShell title={t("auth.registerTitle")} subtitle={t("auth.registerSubtitle")} footer={<>{t("auth.haveAccount")} <Link className="font-medium text-primary hover:underline" href="/login">{t("auth.signInLink")}</Link></>}>
      <ActionForm action={registerAction} className="flex flex-col gap-4">
        <Field label={t("auth.fullName")} htmlFor="name"><Input id="name" name="name" autoComplete="name" /><FieldError name="name" /></Field>
        <Field label={t("auth.workEmail")} htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" /><FieldError name="email" /></Field>
        <Field label={t("auth.password")} htmlFor="password" hint={t("auth.passwordHint")}><Input id="password" name="password" type="password" autoComplete="new-password" /><FieldError name="password" /></Field>
        <Field label={t("auth.organisation")} htmlFor="organizationName" hint={t("auth.organisationHint")}><Input id="organizationName" name="organizationName" /><FieldError name="organizationName" /></Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("auth.firstCompany")} htmlFor="companyName" className="sm:col-span-2"><Input id="companyName" name="companyName" /><FieldError name="companyName" /></Field>
          <Field label={t("auth.baseCurrency")} htmlFor="currency"><CurrencySelect id="currency" name="currency" currencies={currencies} defaultValue="SRD" /><FieldError name="currency" /></Field>
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">{t("auth.baseCurrencyHint")}</p>
        <SubmitButton className="mt-2 w-full" pendingText={t("auth.creatingAccount")}>{t("auth.createAccount")}</SubmitButton>
      </ActionForm>
    </AuthShell>
  );
}
