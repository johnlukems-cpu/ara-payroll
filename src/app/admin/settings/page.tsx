import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/server/admin-page";
import { getI18n } from "@/lib/server/i18n";
import { saasSettings } from "@/lib/server/saas";
import { savePaymentMethodAction, saveSaasSettingsAction } from "@/app/actions/admin";
import { ActionForm, FieldError } from "@/components/action-form";
import { OpField, OpForm } from "@/components/admin-op-form";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("saas.nav.settings") };
}

/** Platform settings (registration mode, invoicing) and payment methods. Changes are reserved for super administrators. */
export default async function AdminSettingsPage() {
  const ctx = await requireAdminPage();
  const { t } = await getI18n();
  const [s, methods] = await Promise.all([saasSettings(), db.paymentMethod.findMany({ orderBy: { code: "asc" } })]);
  const disabled = !ctx.isSuper;
  return (
    <div className="space-y-6">
      <PageHeader title={t("saas.settings.title")} description={t("saas.settings.subtitle")} />
      {disabled && <Alert variant="warning">{t("saas.settings.superOnly")}</Alert>}
      <Card>
        <CardHeader><CardTitle>{t("saas.settings.general")}</CardTitle></CardHeader>
        <CardContent>
          <ActionForm action={saveSaasSettingsAction} className="grid gap-4 sm:grid-cols-2" id="saas-settings">
            <fieldset disabled={disabled} className="contents">
              <Field label={t("saas.settings.registrationMode")} hint={t("saas.settings.registrationModeHint")}>
                <Select name="registrationMode" defaultValue={s.registrationMode}><option value="APPROVAL">{t("saas.settings.mode.APPROVAL")}</option><option value="INSTANT">{t("saas.settings.mode.INSTANT")}</option></Select>
              </Field>
              <Field label={t("saas.settings.invoicePrefix")} hint={t("saas.settings.invoicePrefixHint")}><Input name="invoicePrefix" defaultValue={s.invoicePrefix} /><FieldError name="invoicePrefix" /></Field>
              <Field label={t("saas.settings.paymentTermDays")}><Input name="paymentTermDays" type="number" min={0} max={120} defaultValue={s.paymentTermDays} /></Field>
              <Field label={t("saas.settings.trialReminderDays")}><Input name="trialReminderDays" type="number" min={1} max={60} defaultValue={s.trialReminderDays} /></Field>
              <Field label={t("saas.settings.sellerDetails")} hint={t("saas.settings.sellerDetailsHint")}><Textarea name="sellerDetails" rows={5} defaultValue={s.sellerDetails} /></Field>
              <Field label={t("saas.settings.paymentInstructions")} hint={t("saas.settings.paymentInstructionsHint")}><Textarea name="paymentInstructions" rows={5} defaultValue={s.paymentInstructions} /></Field>
              <div className="sm:col-span-2"><SubmitButton>{t("common.save")}</SubmitButton></div>
            </fieldset>
          </ActionForm>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{t("saas.settings.paymentMethods")}</CardTitle><CardDescription>{t("saas.settings.paymentMethodsHint")}</CardDescription></CardHeader>
        <Table>
          <THead><TR><TH>{t("saas.plans.code")}</TH><TH>{t("saas.plans.name")}</TH><TH>{t("saas.settings.instructions")}</TH><TH>{t("saas.customers.cols.status")}</TH></TR></THead>
          <TBody>
            {methods.map((m) => <TR key={m.code}><TD className="font-mono text-xs">{m.code}</TD><TD>{m.nameNl}<span className="block text-xs text-muted-foreground">{m.nameEn}</span></TD><TD className="max-w-sm text-xs">{m.instructions ?? "—"}</TD><TD><Badge variant={m.isActive ? "success" : "muted"}>{t(m.isActive ? "saas.plans.active" : "saas.plans.inactive")}</Badge></TD></TR>)}
          </TBody>
        </Table>
        {!disabled && (
          <div className="p-4">
            <OpForm action={savePaymentMethodAction} title={t("saas.settings.addMethod")} submit={t("common.save")} hidden={{}}>
              <OpField label={t("saas.plans.code")}><Input name="code" placeholder="BANK_TRANSFER" required /></OpField>
              <OpField label={t("saas.plans.nameNl")}><Input name="nameNl" required /></OpField>
              <OpField label={t("saas.plans.nameEn")}><Input name="nameEn" required /></OpField>
              <OpField label={t("saas.settings.instructions")}><Input name="instructions" /></OpField>
              <label className="flex items-center gap-2 text-xs sm:col-span-2"><input type="checkbox" name="isActive" defaultChecked /> {t("saas.plans.isActive")}</label>
              <p className="text-xs text-muted-foreground sm:col-span-2">{t("saas.settings.methodHint")}</p>
            </OpForm>
          </div>
        )}
      </Card>
      <Card>
        <CardHeader><CardTitle>{t("saas.settings.currencies")}</CardTitle><CardDescription>{t("saas.settings.currenciesHint")}</CardDescription></CardHeader>
        <CardContent><Link href="/app/admin" className="text-sm text-primary hover:underline">{t("saas.settings.toPlatformAdmin")}</Link></CardContent>
      </Card>
    </div>
  );
}
