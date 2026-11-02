import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { ActionForm, FieldError } from "@/components/action-form";
import { ActionButton } from "@/components/confirm-button";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { deleteDepartmentAction, saveDepartmentAction } from "@/app/actions/settings";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("settings.tabs.departments") };
}

export default async function DepartmentsPage() {
  const ctx = await requirePage("settings.manage");
  const { t } = await getI18n();
  const list = await db.department.findMany({ where: { companyId: ctx.company.id }, include: { _count: { select: { employees: true } } }, orderBy: { name: "asc" } });
  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>{t("settings.departments.title")}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <ul className="divide-y rounded-lg border">
          {list.map((d) => (
            <li key={d.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span>{d.name} <span className="text-muted-foreground">· {t("settings.departments.employees", { count: d._count.employees })}</span></span>
              <ActionButton action={deleteDepartmentAction} fields={{ id: d.id }} variant="ghost" size="sm" confirm={t("settings.departments.removeConfirm")}>{t("common.remove")}</ActionButton>
            </li>
          ))}
        </ul>
        <ActionForm action={saveDepartmentAction} className="flex gap-2" resetOnSuccess>
          <div className="flex-1"><Input name="name" placeholder={t("settings.departments.placeholder")} aria-label={t("settings.departments.placeholder")} /><FieldError name="name" /></div>
          <SubmitButton>{t("common.add")}</SubmitButton>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
