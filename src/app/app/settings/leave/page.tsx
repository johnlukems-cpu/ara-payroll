import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { saveLeaveTypeAction } from "@/app/actions/settings";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("settings.tabs.leave") };
}

export default async function LeaveTypesPage() {
  const ctx = await requirePage("settings.manage");
  const { t, f } = await getI18n();
  const list = await db.leaveType.findMany({ where: { companyId: ctx.company.id }, orderBy: { name: "asc" } });
  const row = (lt?: (typeof list)[number]) => (
    <ActionForm key={lt?.id ?? "new"} action={saveLeaveTypeAction} className="grid items-end gap-2 rounded-lg border p-3 sm:grid-cols-6" resetOnSuccess={!lt}>
      {lt && <input type="hidden" name="id" value={lt.id} />}
      <Field label={t("settings.leaveTypes.code")} htmlFor={`c-${lt?.id}`}><Input id={`c-${lt?.id}`} name="code" defaultValue={lt?.code} /></Field>
      <Field label={t("settings.leaveTypes.name")} htmlFor={`n-${lt?.id}`} className="sm:col-span-2"><Input id={`n-${lt?.id}`} name="name" defaultValue={lt?.name} /></Field>
      <Field label={t("settings.leaveTypes.days")} htmlFor={`d-${lt?.id}`}><Input id={`d-${lt?.id}`} name="annualEntitlementDays" defaultValue={f.number(lt?.annualEntitlementDays ?? 0)} /></Field>
      <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="isPaid" defaultChecked={lt?.isPaid ?? true} /> {t("settings.leaveTypes.paid")}</label>
      <SubmitButton size="sm" variant={lt ? "outline" : "default"}>{lt ? t("common.save") : t("settings.leaveTypes.add")}</SubmitButton>
    </ActionForm>
  );
  return (
    <Card>
      <CardHeader><CardTitle>{t("settings.leaveTypes.title")}</CardTitle><CardDescription>{t("settings.leaveTypes.sub")}</CardDescription></CardHeader>
      <CardContent className="space-y-3">{list.map((lt) => row(lt))}{row()}</CardContent>
    </Card>
  );
}
