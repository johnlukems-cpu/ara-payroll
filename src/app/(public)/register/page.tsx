import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ActionForm, FieldError } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Field, Input } from "@/components/ui/form";
import { CurrencySelect } from "@/components/currency-select";
import { registerAction } from "@/app/actions/auth";
import { getCurrencies } from "@/lib/server/rates";
import { AuthShell } from "../auth-shell";
import { db } from "@/lib/db";
import { saasSettings } from "@/lib/server/saas";
import { Select } from "@/components/ui/form";

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("auth.registerTitle") };
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ plan?: string; submitted?: string }> }) {
  const t = await getTranslations();
  const locale = await getLocale();
  const sp = await searchParams;
  const currencies = await getCurrencies();
  const plans = await db.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
  const plan = plans.find((p) => p.code === sp.plan) ?? null;
  const mode = (await saasSettings()).registrationMode;
  if (sp.submitted) {
    return (
      <AuthShell title={t("auth.requestReceivedTitle")} subtitle={t("auth.requestReceivedSub")} footer={<Link className="font-medium text-primary hover:underline" href="/">{t("contact.backToPricing")}</Link>}>
        <p className="rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm" data-testid="registration-submitted">{t("auth.requestReceivedText")}</p>
      </AuthShell>
    );
  }
  return (
    <AuthShell title={t("auth.registerTitle")} subtitle={t("auth.registerSubtitle")} footer={<>{t("auth.haveAccount")} <Link className="font-medium text-primary hover:underline" href="/login">{t("auth.signInLink")}</Link></>}>
      {plan && (
        <p className="mb-5 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm" data-testid="chosen-plan">
          {t("pricing.chosenPlan", { plan: locale === "en" ? plan.nameEn : plan.nameNl, days: plan.trialDays })}
        </p>
      )}
      {mode === "APPROVAL" && <p className="mb-5 text-xs text-muted-foreground">{t("auth.approvalNote")}</p>}
      <ActionForm action={registerAction} className="flex flex-col gap-4">
        <Field label={t("contact.plan")} htmlFor="plan">
          <Select id="plan" name="plan" defaultValue={plan?.code ?? plans[0]?.code}>
            {plans.map((p) => <option key={p.code} value={p.code}>{locale === "en" ? p.nameEn : p.nameNl}</option>)}
          </Select>
        </Field>
        <Field label={t("auth.fullName")} htmlFor="name"><Input id="name" name="name" autoComplete="name" /><FieldError name="name" /></Field>
        <Field label={t("auth.workEmail")} htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" /><FieldError name="email" /></Field>
        <Field label={t("auth.password")} htmlFor="password" hint={t("auth.passwordHint")}><Input id="password" name="password" type="password" autoComplete="new-password" /><FieldError name="password" /></Field>
        <Field label={t("auth.organisation")} htmlFor="organizationName" hint={t("auth.organisationHint")}><Input id="organizationName" name="organizationName" /><FieldError name="organizationName" /></Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("auth.firstCompany")} htmlFor="companyName" className="sm:col-span-2"><Input id="companyName" name="companyName" /><FieldError name="companyName" /></Field>
          <Field label={t("auth.baseCurrency")} htmlFor="currency"><CurrencySelect id="currency" name="currency" currencies={currencies} defaultValue="SRD" /><FieldError name="currency" /></Field>
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">{t("auth.baseCurrencyHint")}</p>
        <Field label={t("contact.phone")} htmlFor="phone"><Input id="phone" name="phone" type="tel" autoComplete="tel" /><FieldError name="phone" /></Field>
        <SubmitButton className="mt-2 w-full" pendingText={t("auth.creatingAccount")}>{t("auth.createAccount")}</SubmitButton>
      </ActionForm>
    </AuthShell>
  );
}
