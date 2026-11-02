import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { ActionForm, FieldError } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { saveComponentAction } from "@/app/actions/settings";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("settings.tabs.components") };
}

const TREATMENTS = ["TAXABLE", "EXEMPT", "EXEMPT_UP_TO_LIMIT", "CHILD_ALLOWANCE"] as const;
const CALC = ["FIXED", "PERCENT_OF_BASE"] as const;

export default async function ComponentsPage() {
  const ctx = await requirePage("settings.manage");
  const { t, f } = await getI18n();
  const list = await db.payComponent.findMany({ where: { companyId: ctx.company.id }, orderBy: [{ kind: "asc" }, { code: "asc" }] });
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>{t("settings.components.title")}</CardTitle><CardDescription>{t("settings.components.sub")}</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {list.map((c) => (
            <ActionForm key={c.id} action={saveComponentAction} className="grid items-end gap-2 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-8">
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="kind" value={c.kind} />
              <Field label={t("settings.components.code")} htmlFor={`code-${c.id}`}><Input id={`code-${c.id}`} name="code" defaultValue={c.code} /></Field>
              <Field label={t("settings.components.name")} htmlFor={`name-${c.id}`} className="lg:col-span-2"><Input id={`name-${c.id}`} name="name" defaultValue={c.name} /></Field>
              <Field label={t("settings.components.calculation")} htmlFor={`calc-${c.id}`}><Select id={`calc-${c.id}`} name="calcType" defaultValue={c.calcType}>{CALC.map((v) => <option key={v} value={v}>{t(`enums.calcType.${v}`)}</option>)}</Select></Field>
              {c.kind === "ALLOWANCE" ? (
                <>
                  <Field label={t("settings.components.treatment")} htmlFor={`tt-${c.id}`}><Select id={`tt-${c.id}`} name="taxTreatment" defaultValue={c.taxTreatment}>{TREATMENTS.map((v) => <option key={v} value={v}>{t(`enums.taxTreatment.${v}`)}</option>)}</Select></Field>
                  <Field label={t("settings.components.limit")} htmlFor={`lim-${c.id}`}><Input id={`lim-${c.id}`} name="exemptLimit" defaultValue={f.input(c.exemptLimit)} /></Field>
                </>
              ) : (
                <label className="flex items-center gap-2 pb-2 text-sm lg:col-span-2"><input type="checkbox" name="preTax" defaultChecked={c.preTax} /> {t("settings.components.preTax")}</label>
              )}
              <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={c.isActive} /> {t("settings.components.active")} <Badge variant={c.kind === "ALLOWANCE" ? "success" : "warning"}>{c.kind === "ALLOWANCE" ? "+" : "−"}</Badge></label>
              <SubmitButton size="sm" variant="outline">{t("common.save")}</SubmitButton>
            </ActionForm>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{t("settings.components.new")}</CardTitle></CardHeader>
        <CardContent>
          <ActionForm action={saveComponentAction} className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4" resetOnSuccess>
            <Field label={t("settings.components.code")} htmlFor="code"><Input id="code" name="code" placeholder={t("settings.components.codePlaceholder")} /><FieldError name="code" /></Field>
            <Field label={t("settings.components.name")} htmlFor="name"><Input id="name" name="name" /><FieldError name="name" /></Field>
            <Field label={t("settings.components.kind")} htmlFor="kind"><Select id="kind" name="kind"><option value="ALLOWANCE">{t("enums.componentKind.ALLOWANCE")} (+)</option><option value="DEDUCTION">{t("enums.componentKind.DEDUCTION")} (−)</option></Select></Field>
            <Field label={t("settings.components.calculation")} htmlFor="calcType"><Select id="calcType" name="calcType">{CALC.map((v) => <option key={v} value={v}>{t(`enums.calcType.${v}`)}</option>)}</Select></Field>
            <Field label={t("settings.components.treatmentAllowances")} htmlFor="taxTreatment"><Select id="taxTreatment" name="taxTreatment">{TREATMENTS.map((v) => <option key={v} value={v}>{t(`enums.taxTreatment.${v}`)}</option>)}</Select></Field>
            <Field label={t("settings.components.limit")} htmlFor="exemptLimit"><Input id="exemptLimit" name="exemptLimit" /><FieldError name="exemptLimit" /></Field>
            <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="preTax" /> {t("settings.components.preTax")}</label>
            <SubmitButton>{t("settings.components.add")}</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
