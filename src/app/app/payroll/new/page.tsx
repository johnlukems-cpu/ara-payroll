import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { toDateInput } from "@/lib/format";
import { ActionForm, FieldError } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/misc";
import { createRunAction } from "@/app/actions/payroll";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("payroll.newTitle") };
}

export default async function NewRunPage() {
  await requirePage("payroll.run");
  const { t, f } = await getI18n();
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const payDate = new Date(Date.UTC(y, m - 1, 25));
  return (
    <div className="max-w-2xl">
      <PageHeader title={t("payroll.newTitle")} description={t("payroll.newSubtitle")} />
      <Card>
        <CardContent className="pt-5">
          <ActionForm action={createRunAction} className="grid gap-4 sm:grid-cols-3">
            <Field label={t("payroll.month")} htmlFor="month">
              <Select id="month" name="month" defaultValue={m}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{f.month(i + 1)}</option>)}</Select>
            </Field>
            <Field label={t("payroll.year")} htmlFor="year"><Input id="year" name="year" type="number" defaultValue={y} /><FieldError name="year" /></Field>
            <Field label={t("payroll.payDate")} htmlFor="payDate"><Input id="payDate" name="payDate" type="date" defaultValue={toDateInput(payDate)} /><FieldError name="payDate" /></Field>
            <Field label={t("payroll.notes")} htmlFor="notes" className="sm:col-span-3"><Textarea id="notes" name="notes" /></Field>
            <div className="flex justify-end sm:col-span-3"><SubmitButton>{t("payroll.create")}</SubmitButton></div>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
