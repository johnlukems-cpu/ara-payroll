import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { LegalBadge } from "@/components/legal-badge";
import { saveLeaveTypeAction } from "@/app/actions/settings";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("settings.tabs.leave") };
}

const CATEGORIES = ["ANNUAL", "SICK", "SPECIAL", "UNPAID", "PUBLIC_HOLIDAY", "PARENTAL", "MATERNITY", "PATERNITY", "ADOPTION", "UNAUTHORIZED"] as const;
const LEGAL = ["COMPANY_POLICY", "PENDING_VERIFICATION", "CONFLICT", "VERIFIED"] as const;

export default async function LeaveTypesPage() {
  const ctx = await requirePage("settings.manage");
  const { t, f } = await getI18n();
  const list = await db.leaveType.findMany({ where: { companyId: ctx.company.id }, orderBy: [{ category: "asc" }, { name: "asc" }] });
  const row = (lt?: (typeof list)[number]) => (
    <ActionForm key={lt?.id ?? "new"} action={saveLeaveTypeAction} className="space-y-3 rounded-lg border p-4" resetOnSuccess={!lt}>
      {lt && <input type="hidden" name="id" value={lt.id} />}
      <div className="flex items-center justify-between gap-2"><p className="font-medium">{lt ? lt.name : t("settings.leaveTypes.add")}</p>{lt && <LegalBadge status={lt.legalStatus} />}</div>
      <div className="grid items-end gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Field label={t("settings.leaveTypes.code")} htmlFor={`c-${lt?.id}`}><Input id={`c-${lt?.id}`} name="code" defaultValue={lt?.code} /></Field>
        <Field label={t("settings.leaveTypes.name")} htmlFor={`n-${lt?.id}`} className="sm:col-span-2"><Input id={`n-${lt?.id}`} name="name" defaultValue={lt?.name} /></Field>
        <Field label={t("leaveTypes.category")} htmlFor={`cat-${lt?.id}`}><Select id={`cat-${lt?.id}`} name="category" defaultValue={lt?.category ?? "SPECIAL"}>{CATEGORIES.map((c) => <option key={c} value={c}>{t(`leaveTypes.categories.${c}`)}</option>)}</Select></Field>
        <Field label={t("leaveTypes.payPercent")} htmlFor={`p-${lt?.id}`} hint={t("leaveTypes.payPercentHint")}><Input id={`p-${lt?.id}`} name="payPercentBp" defaultValue={f.number((lt?.payPercentBp ?? 10000) / 100)} /></Field>
        <Field label={t("leaveTypes.unit")} htmlFor={`u-${lt?.id}`}><Select id={`u-${lt?.id}`} name="unit" defaultValue={lt?.unit ?? "DAYS"}><option value="DAYS">{t("leaveTypes.units.DAYS")}</option><option value="HOURS">{t("leaveTypes.units.HOURS")}</option></Select></Field>
        <Field label={t("settings.leaveTypes.days")} htmlFor={`d-${lt?.id}`} hint={t("leaveTypes.annualHint")}><Input id={`d-${lt?.id}`} name="annualEntitlementDays" defaultValue={f.number(lt?.annualEntitlementDays ?? 0)} /></Field>
        <Field label={t("leaveTypes.statutory")} htmlFor={`s-${lt?.id}`} hint={t("leaveTypes.statutoryHint")}><Input id={`s-${lt?.id}`} name="statutoryDays" defaultValue={lt?.statutoryDays != null ? f.number(lt.statutoryDays) : ""} /></Field>
        <Field label={t("leaveTypes.companyExtra")} htmlFor={`x-${lt?.id}`}><Input id={`x-${lt?.id}`} name="companyExtraDays" defaultValue={f.number(lt?.companyExtraDays ?? 0)} /></Field>
        <Field label={t("leaveTypes.maxCarry")} htmlFor={`m-${lt?.id}`}><Input id={`m-${lt?.id}`} name="maxCarryForwardDays" defaultValue={f.number(lt?.maxCarryForwardDays ?? 0)} /></Field>
        <Field label={t("leaveTypes.legalStatus")} htmlFor={`l-${lt?.id}`}><Select id={`l-${lt?.id}`} name="legalStatus" defaultValue={lt?.legalStatus ?? "COMPANY_POLICY"}>{LEGAL.map((c) => <option key={c} value={c}>{t(`legal.${c}`)}</option>)}</Select></Field>
        <Field label={t("leaveTypes.legalReference")} htmlFor={`r-${lt?.id}`} className="sm:col-span-2"><Input id={`r-${lt?.id}`} name="legalReference" defaultValue={lt?.legalReference ?? ""} /></Field>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="allowPartTime" defaultChecked={lt?.allowPartTime} /> {t("leaveTypes.allowPartTime")}</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="carryForward" defaultChecked={lt?.carryForward} /> {t("leaveTypes.carryForward")}</label>
        <SubmitButton size="sm" variant={lt ? "outline" : "default"} className="ml-auto">{lt ? t("common.save") : t("settings.leaveTypes.add")}</SubmitButton>
      </div>
    </ActionForm>
  );
  return (
    <Card>
      <CardHeader><CardTitle>{t("settings.leaveTypes.title")}</CardTitle><CardDescription>{t("leaveTypes.sub")}</CardDescription></CardHeader>
      <CardContent className="space-y-3">{list.map((lt) => row(lt))}{row()}</CardContent>
    </Card>
  );
}
