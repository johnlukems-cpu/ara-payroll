import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { ActionForm, FieldError } from "@/components/action-form";
import { ActionButton } from "@/components/confirm-button";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { changeRoleAction, inviteUserAction, removeMemberAction } from "@/app/actions/settings";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("settings.tabs.users") };
}

const ROLES = ["OWNER", "ADMIN", "PAYROLL_MANAGER", "HR_MANAGER", "ACCOUNTANT", "EMPLOYEE"] as const;

export default async function UsersPage() {
  const ctx = await requirePage("users.manage");
  const { t, f } = await getI18n();
  const members = await db.membership.findMany({ where: { companyId: ctx.company.id }, include: { user: true }, orderBy: [{ role: "asc" }, { user: { name: "asc" } }] });
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>{t("settings.users.title")}</CardTitle><CardDescription>{t("settings.users.sub", { company: ctx.company.name })}</CardDescription></CardHeader>
        <Table>
          <THead><TR><TH>{t("settings.users.cols.name")}</TH><TH>{t("settings.users.cols.email")}</TH><TH>{t("settings.users.cols.lastLogin")}</TH><TH>{t("settings.users.cols.role")}</TH><TH /></TR></THead>
          <TBody>
            {members.map((m) => (
              <TR key={m.id}>
                <TD className="font-medium">{m.user.name}</TD>
                <TD>{m.user.email}</TD>
                <TD className="tabular">{f.date(m.user.lastLoginAt)}</TD>
                <TD>
                  {m.userId === ctx.user.id ? t(`roles.${m.role}`) : (
                    <ActionForm action={changeRoleAction} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={m.id} />
                      <Select name="role" defaultValue={m.role} className="h-8 w-56" aria-label={t("settings.users.role")}>{ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}</Select>
                      <SubmitButton size="sm" variant="outline">{t("common.update")}</SubmitButton>
                    </ActionForm>
                  )}
                </TD>
                <TD className="text-right">{m.userId !== ctx.user.id && <ActionButton action={removeMemberAction} fields={{ id: m.id }} variant="ghost" size="sm" confirm={t("settings.users.removeConfirm")}>{t("common.remove")}</ActionButton>}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <Card className="max-w-3xl">
        <CardHeader><CardTitle>{t("settings.users.addTitle")}</CardTitle><CardDescription>{t("settings.users.addSub")}</CardDescription></CardHeader>
        <CardContent>
          <ActionForm action={inviteUserAction} className="grid items-end gap-3 sm:grid-cols-4" resetOnSuccess>
            <Field label={t("settings.users.name")} htmlFor="name"><Input id="name" name="name" /><FieldError name="name" /></Field>
            <Field label={t("settings.users.email")} htmlFor="email"><Input id="email" name="email" type="email" /><FieldError name="email" /></Field>
            <Field label={t("settings.users.role")} htmlFor="role"><Select id="role" name="role" defaultValue="PAYROLL_MANAGER">{ROLES.filter((r) => r !== "EMPLOYEE").map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}</Select></Field>
            <SubmitButton>{t("settings.users.add")}</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
