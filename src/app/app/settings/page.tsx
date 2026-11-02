import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { SURINAME_BANKS, SURINAME_DISTRICTS } from "@/lib/format";
import { ActionForm, FieldError } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { updateCompanyAction } from "@/app/actions/settings";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("settings.tabs.company") };
}

export default async function CompanySettings() {
  const ctx = await requirePage("company.manage");
  const { t, f: fmt } = await getI18n();
  const c = ctx.company;
  const f = (name: string, label: string, value: string | number | null | undefined, hint?: string) => (
    <Field label={label} htmlFor={name} hint={hint}><Input id={name} name={name} defaultValue={value ?? ""} /><FieldError name={name} /></Field>
  );
  return (
    <ActionForm action={updateCompanyAction} className="space-y-6">
      <Card>
        <CardHeader><CardTitle>{t("settings.company.employer")}</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {f("name", t("settings.company.displayName"), c.name)}
          {f("legalName", t("settings.company.legalName"), c.legalName)}
          {f("kkfNumber", t("settings.company.kkf"), c.kkfNumber, t("settings.company.kkfHint"))}
          {f("taxNumber", t("settings.company.taxNumber"), c.taxNumber)}
          {f("address", t("settings.company.address"), c.address)}
          <Field label={t("settings.company.district")} htmlFor="district"><Select id="district" name="district" defaultValue={c.district ?? ""}><option value="">—</option>{SURINAME_DISTRICTS.map((d) => <option key={d}>{d}</option>)}</Select></Field>
          {f("phone", t("settings.company.phone"), c.phone)}
          {f("email", t("settings.company.email"), c.email)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{t("settings.company.paymentTime")}</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t("settings.company.bank")} htmlFor="bankName"><Select id="bankName" name="bankName" defaultValue={c.bankName ?? ""}><option value="">—</option>{SURINAME_BANKS.map((b) => <option key={b}>{b}</option>)}</Select></Field>
          {f("bankAccount", t("settings.company.debitAccount"), c.bankAccount)}
          {f("defaultHoursPerWeek", t("settings.company.hoursPerWeek"), c.defaultHoursPerWeek)}
          {f("overtimeRate1Bp", t("settings.company.ot1"), fmt.number(c.overtimeRate1Bp / 100), t("settings.company.ot1Hint"))}
          {f("overtimeRate2Bp", t("settings.company.ot2"), fmt.number(c.overtimeRate2Bp / 100), t("settings.company.ot2Hint"))}
        </CardContent>
      </Card>
      <div className="flex justify-end"><SubmitButton>{t("settings.company.save")}</SubmitButton></div>
    </ActionForm>
  );
}
