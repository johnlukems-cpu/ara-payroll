import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/server/admin-page";
import { getI18n } from "@/lib/server/i18n";
import { getCurrencies } from "@/lib/server/rates";
import { savePlanAction } from "@/app/actions/admin";
import { ActionForm, FieldError } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { CurrencySelect } from "@/components/currency-select";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Alert, PageHeader } from "@/components/ui/misc";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("saas.nav.plans") };
}

const list = (v: unknown) => (Array.isArray(v) ? v.map(String).join("\n") : "");
const decimal = (v: number | null | undefined) => (v == null ? "" : (v / 100).toFixed(2));

/** Create or edit a subscription plan. */
export default async function PlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  await requireAdminPage();
  const { t } = await getI18n();
  const { id } = await params;
  const plan = id === "new" ? null : await db.plan.findUnique({ where: { id } });
  if (id !== "new" && !plan) notFound();
  const currencies = await getCurrencies();
  const sp = await searchParams;
  return (
    <div className="space-y-6">
      <PageHeader title={plan ? plan.nameNl : t("saas.plans.new")} description={t("saas.plans.contractNote")} actions={<Link href="/admin/plans" className="text-sm text-primary hover:underline">{t("saas.plans.back")}</Link>} />
      {sp.created && <Alert variant="success">{t("saas.msg.planSaved")}</Alert>}
      <Card>
        <CardContent className="pt-6">
          <ActionForm action={savePlanAction} className="grid gap-4 sm:grid-cols-2" id="plan-form">
            {plan && <input type="hidden" name="id" value={plan.id} />}
            <Field label={t("saas.plans.code")} hint={t("saas.plans.codeHint")}><Input name="code" defaultValue={plan?.code ?? ""} required /><FieldError name="code" /></Field>
            <Field label={t("saas.plans.sortOrder")}><Input name="sortOrder" type="number" min={0} defaultValue={plan?.sortOrder ?? 50} /></Field>
            <Field label={t("saas.plans.nameNl")}><Input name="nameNl" defaultValue={plan?.nameNl ?? ""} required /><FieldError name="nameNl" /></Field>
            <Field label={t("saas.plans.nameEn")}><Input name="nameEn" defaultValue={plan?.nameEn ?? ""} required /><FieldError name="nameEn" /></Field>
            <Field label={t("saas.plans.descriptionNl")}><Textarea name="descriptionNl" rows={2} defaultValue={plan?.descriptionNl ?? ""} /></Field>
            <Field label={t("saas.plans.descriptionEn")}><Textarea name="descriptionEn" rows={2} defaultValue={plan?.descriptionEn ?? ""} /></Field>
            <Field label={t("saas.customers.currency")}><CurrencySelect name="currency" currencies={currencies} defaultValue={plan?.currency ?? "SRD"} /></Field>
            <Field label={t("saas.plans.discount")} hint={t("saas.plans.discountHint")}><Input name="discount" inputMode="decimal" defaultValue={plan ? String(plan.discountBp / 100) : "0"} /><FieldError name="discount" /></Field>
            <Field label={t("saas.plans.monthlyPrice")} hint={t("saas.plans.priceHint")}><Input name="monthlyPrice" inputMode="decimal" defaultValue={decimal(plan?.monthlyPrice)} /><FieldError name="monthlyPrice" /></Field>
            <Field label={t("saas.plans.yearlyPrice")} hint={t("saas.plans.priceHint")}><Input name="yearlyPrice" inputMode="decimal" defaultValue={decimal(plan?.yearlyPrice)} /><FieldError name="yearlyPrice" /></Field>
            <Field label={t("saas.plans.minEmployees")}><Input name="minEmployees" type="number" min={0} defaultValue={plan?.minEmployees ?? ""} /></Field>
            <Field label={t("saas.plans.maxEmployees")} hint={t("saas.plans.maxHint")}><Input name="maxEmployees" type="number" min={1} defaultValue={plan?.maxEmployees ?? ""} /></Field>
            <Field label={t("saas.plans.trialDays")}><Input name="trialDays" type="number" min={0} max={365} defaultValue={plan?.trialDays ?? 30} /></Field>
            <Field label={t("saas.plans.modules")} hint={t("saas.plans.linesHint")}><Textarea name="modules" rows={4} defaultValue={list(plan?.modules)} /></Field>
            <Field label={t("saas.plans.featuresNl")} hint={t("saas.plans.linesHint")}><Textarea name="featuresNl" rows={6} defaultValue={list(plan?.featuresNl)} /></Field>
            <Field label={t("saas.plans.featuresEn")} hint={t("saas.plans.linesHint")}><Textarea name="featuresEn" rows={6} defaultValue={list(plan?.featuresEn)} /></Field>
            <div className="flex flex-wrap gap-5 text-sm sm:col-span-2">
              <label className="flex items-center gap-2"><input type="checkbox" name="isActive" defaultChecked={plan?.isActive ?? true} /> {t("saas.plans.isActive")}</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="isPublished" defaultChecked={plan?.isPublished ?? false} /> {t("saas.plans.isPublished")}</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="popular" defaultChecked={plan?.popular ?? false} /> {t("saas.plans.popular")}</label>
            </div>
            <div className="sm:col-span-2"><SubmitButton>{t("common.save")}</SubmitButton></div>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
