import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { amount } from "@/lib/format";
import { ActionForm, FieldError } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { saveComponentAction } from "@/app/actions/settings";

export const metadata = { title: "Pay components" };

const TREATMENT: Record<string, string> = { TAXABLE: "Taxable", EXEMPT: "Tax-free", EXEMPT_UP_TO_LIMIT: "Tax-free up to limit", CHILD_ALLOWANCE: "Child allowance (statutory limit)" };

export default async function ComponentsPage() {
  const ctx = await requirePage("settings.manage");
  const list = await db.payComponent.findMany({ where: { companyId: ctx.company.id }, orderBy: [{ kind: "asc" }, { code: "asc" }] });
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Allowances & deductions</CardTitle><CardDescription>Define how each component is calculated and taxed. Edit a row and save to update.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {list.map((c) => (
            <ActionForm key={c.id} action={saveComponentAction} className="grid items-end gap-2 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-8">
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="kind" value={c.kind} />
              <Field label="Code" htmlFor={`code-${c.id}`}><Input id={`code-${c.id}`} name="code" defaultValue={c.code} /></Field>
              <Field label="Name" htmlFor={`name-${c.id}`} className="lg:col-span-2"><Input id={`name-${c.id}`} name="name" defaultValue={c.name} /></Field>
              <Field label="Calculation" htmlFor={`calc-${c.id}`}><Select id={`calc-${c.id}`} name="calcType" defaultValue={c.calcType}><option value="FIXED">Fixed amount</option><option value="PERCENT_OF_BASE">% of base salary</option></Select></Field>
              {c.kind === "ALLOWANCE" ? (
                <>
                  <Field label="Tax treatment" htmlFor={`tt-${c.id}`}><Select id={`tt-${c.id}`} name="taxTreatment" defaultValue={c.taxTreatment}>{Object.entries(TREATMENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
                  <Field label="Monthly tax-free limit" htmlFor={`lim-${c.id}`}><Input id={`lim-${c.id}`} name="exemptLimit" defaultValue={amount(c.exemptLimit)} /></Field>
                </>
              ) : (
                <label className="flex items-center gap-2 pb-2 text-sm lg:col-span-2"><input type="checkbox" name="preTax" defaultChecked={c.preTax} /> Deduct before tax</label>
              )}
              <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={c.isActive} /> Active <Badge variant={c.kind === "ALLOWANCE" ? "success" : "warning"}>{c.kind === "ALLOWANCE" ? "+" : "−"}</Badge></label>
              <SubmitButton size="sm" variant="outline">Save</SubmitButton>
            </ActionForm>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>New component</CardTitle></CardHeader>
        <CardContent>
          <ActionForm action={saveComponentAction} className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4" resetOnSuccess>
            <Field label="Code" htmlFor="code"><Input id="code" name="code" placeholder="e.g. MEAL" /><FieldError name="code" /></Field>
            <Field label="Name" htmlFor="name"><Input id="name" name="name" /><FieldError name="name" /></Field>
            <Field label="Kind" htmlFor="kind"><Select id="kind" name="kind"><option value="ALLOWANCE">Allowance (+)</option><option value="DEDUCTION">Deduction (−)</option></Select></Field>
            <Field label="Calculation" htmlFor="calcType"><Select id="calcType" name="calcType"><option value="FIXED">Fixed amount</option><option value="PERCENT_OF_BASE">% of base salary</option></Select></Field>
            <Field label="Tax treatment (allowances)" htmlFor="taxTreatment"><Select id="taxTreatment" name="taxTreatment">{Object.entries(TREATMENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Monthly tax-free limit (SRD)" htmlFor="exemptLimit"><Input id="exemptLimit" name="exemptLimit" /><FieldError name="exemptLimit" /></Field>
            <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="preTax" /> Deduction before tax</label>
            <SubmitButton>Add component</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
