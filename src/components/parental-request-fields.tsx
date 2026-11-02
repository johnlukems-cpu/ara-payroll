import { getI18n } from "@/lib/server/i18n";
import { toDateInput } from "@/lib/format";
import { FieldError } from "@/components/action-form";
import { Field, Input, Select } from "@/components/ui/form";

type LT = { id: string; name: string; category: string; allowPartTime: boolean };

/** Fields of a parental leave request (used by HR registration and employee self-service). */
export async function ParentalRequestFields({ types }: { types: LT[] }) {
  const { t } = await getI18n();
  const today = toDateInput(new Date());
  return (
    <>
      <Field label={t("parental.f.category")} htmlFor="leaveTypeId"><Select id="leaveTypeId" name="leaveTypeId">{types.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select><FieldError name="leaveTypeId" /></Field>
      <Field label={t("parental.f.childBirthDate")} htmlFor="childBirthDate" hint={t("parental.f.childBirthDateHint")}><Input id="childBirthDate" name="childBirthDate" type="date" /><FieldError name="childBirthDate" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("parental.f.start")} htmlFor="startDate"><Input id="startDate" name="startDate" type="date" defaultValue={today} /><FieldError name="startDate" /></Field>
        <Field label={t("parental.f.expectedEnd")} htmlFor="endDate"><Input id="endDate" name="endDate" type="date" defaultValue={today} /><FieldError name="endDate" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("parental.f.days")} htmlFor="days" hint={t("leave.daysHint")}><Input id="days" name="days" inputMode="decimal" /><FieldError name="days" /></Field>
        <Field label={t("parental.f.hours")} htmlFor="hours"><Input id="hours" name="hours" inputMode="decimal" /></Field>
      </div>
      <Field label={t("parental.f.schedule")} htmlFor="schedulePercent" hint={t("parental.f.scheduleHint")}><Input id="schedulePercent" name="schedulePercent" inputMode="decimal" placeholder="100" /><FieldError name="schedulePercent" /></Field>
      <Field label={t("parental.f.scheduleNote")} htmlFor="scheduleNote"><Input id="scheduleNote" name="scheduleNote" placeholder={t("parental.f.scheduleNotePlaceholder")} /></Field>
      <Field label={t("parental.f.documents")} htmlFor="documents" hint={t("parental.f.documentsHint")}><Input id="documents" name="documents" type="file" multiple accept=".pdf,.png,.jpg,.jpeg" className="py-1.5" /></Field>
      <Field label={t("leave.note")} htmlFor="reason"><Input id="reason" name="reason" /></Field>
    </>
  );
}
