import { requirePage } from "@/lib/server/auth";
import { MONTHS, toDateInput } from "@/lib/format";
import { ActionForm, FieldError } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/misc";
import { createRunAction } from "@/app/actions/payroll";

export const metadata = { title: "New payroll run" };

export default async function NewRunPage() {
  await requirePage("payroll.run");
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const payDate = new Date(Date.UTC(y, m - 1, 25));
  return (
    <div className="max-w-2xl">
      <PageHeader title="New payroll run" description="All active employees in the period are included automatically." />
      <Card>
        <CardContent className="pt-5">
          <ActionForm action={createRunAction} className="grid gap-4 sm:grid-cols-3">
            <Field label="Month" htmlFor="month">
              <Select id="month" name="month" defaultValue={m}>{MONTHS.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}</Select>
            </Field>
            <Field label="Year" htmlFor="year"><Input id="year" name="year" type="number" defaultValue={y} /><FieldError name="year" /></Field>
            <Field label="Pay date" htmlFor="payDate"><Input id="payDate" name="payDate" type="date" defaultValue={toDateInput(payDate)} /><FieldError name="payDate" /></Field>
            <Field label="Notes (optional)" htmlFor="notes" className="sm:col-span-3"><Textarea id="notes" name="notes" /></Field>
            <div className="sm:col-span-3 flex justify-end"><SubmitButton>Create payroll run</SubmitButton></div>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
