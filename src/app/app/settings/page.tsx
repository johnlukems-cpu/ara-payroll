import { requirePage } from "@/lib/server/auth";
import { SURINAME_BANKS, SURINAME_DISTRICTS } from "@/lib/format";
import { ActionForm, FieldError } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { updateCompanyAction } from "@/app/actions/settings";

export const metadata = { title: "Company settings" };

export default async function CompanySettings() {
  const ctx = await requirePage("company.manage");
  const c = ctx.company;
  const f = (name: string, label: string, value: string | number | null | undefined, hint?: string) => (
    <Field label={label} htmlFor={name} hint={hint}><Input id={name} name={name} defaultValue={value ?? ""} /><FieldError name={name} /></Field>
  );
  return (
    <ActionForm action={updateCompanyAction} className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Employer details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {f("name", "Display name", c.name)}
          {f("legalName", "Legal name", c.legalName)}
          {f("kkfNumber", "KKF number", c.kkfNumber, "Chamber of Commerce registration")}
          {f("taxNumber", "Tax number (FIB)", c.taxNumber)}
          {f("address", "Address", c.address)}
          <Field label="District" htmlFor="district"><Select id="district" name="district" defaultValue={c.district ?? ""}><option value="">—</option>{SURINAME_DISTRICTS.map((d) => <option key={d}>{d}</option>)}</Select></Field>
          {f("phone", "Phone", c.phone)}
          {f("email", "Email", c.email)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Payment & working time</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Company bank" htmlFor="bankName"><Select id="bankName" name="bankName" defaultValue={c.bankName ?? ""}><option value="">—</option>{SURINAME_BANKS.map((b) => <option key={b}>{b}</option>)}</Select></Field>
          {f("bankAccount", "Debit account (salaries)", c.bankAccount)}
          {f("defaultHoursPerWeek", "Standard hours per week", c.defaultHoursPerWeek)}
          {f("overtimeRate1Bp", "Overtime rate 1 (%)", c.overtimeRate1Bp / 100, "e.g. 150 for weekday overtime")}
          {f("overtimeRate2Bp", "Overtime rate 2 (%)", c.overtimeRate2Bp / 100, "e.g. 200 for Sundays / holidays")}
        </CardContent>
      </Card>
      <div className="flex justify-end"><SubmitButton>Save company</SubmitButton></div>
    </ActionForm>
  );
}
