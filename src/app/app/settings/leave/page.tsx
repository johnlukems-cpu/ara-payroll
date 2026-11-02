import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { saveLeaveTypeAction } from "@/app/actions/settings";

export const metadata = { title: "Leave types" };

export default async function LeaveTypesPage() {
  const ctx = await requirePage("settings.manage");
  const list = await db.leaveType.findMany({ where: { companyId: ctx.company.id }, orderBy: { name: "asc" } });
  const row = (t?: (typeof list)[number]) => (
    <ActionForm key={t?.id ?? "new"} action={saveLeaveTypeAction} className="grid items-end gap-2 rounded-lg border p-3 sm:grid-cols-6" resetOnSuccess={!t}>
      {t && <input type="hidden" name="id" value={t.id} />}
      <Field label="Code" htmlFor={`c-${t?.id}`}><Input id={`c-${t?.id}`} name="code" defaultValue={t?.code} /></Field>
      <Field label="Name" htmlFor={`n-${t?.id}`} className="sm:col-span-2"><Input id={`n-${t?.id}`} name="name" defaultValue={t?.name} /></Field>
      <Field label="Days per year" htmlFor={`d-${t?.id}`}><Input id={`d-${t?.id}`} name="annualEntitlementDays" defaultValue={t?.annualEntitlementDays ?? 0} /></Field>
      <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="isPaid" defaultChecked={t?.isPaid ?? true} /> Paid</label>
      <SubmitButton size="sm" variant={t ? "outline" : "default"}>{t ? "Save" : "Add type"}</SubmitButton>
    </ActionForm>
  );
  return (
    <Card>
      <CardHeader><CardTitle>Leave types</CardTitle><CardDescription>Annual entitlement is prorated in the year of hire. Set 0 for leave without a fixed balance.</CardDescription></CardHeader>
      <CardContent className="space-y-3">{list.map((t) => row(t))}{row()}</CardContent>
    </Card>
  );
}
