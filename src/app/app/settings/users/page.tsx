import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { ROLE_LABELS } from "@/lib/permissions";
import { date } from "@/lib/format";
import { ActionForm, FieldError } from "@/components/action-form";
import { ActionButton } from "@/components/confirm-button";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { changeRoleAction, inviteUserAction, removeMemberAction } from "@/app/actions/settings";

export const metadata = { title: "Users & roles" };

export default async function UsersPage() {
  const ctx = await requirePage("users.manage");
  const members = await db.membership.findMany({ where: { companyId: ctx.company.id }, include: { user: true }, orderBy: [{ role: "asc" }, { user: { name: "asc" } }] });
  const roles = Object.entries(ROLE_LABELS);
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>People with access</CardTitle><CardDescription>Roles control what each user can see and do in {ctx.company.name}.</CardDescription></CardHeader>
        <Table>
          <THead><TR><TH>Name</TH><TH>Email</TH><TH>Last sign-in</TH><TH>Role</TH><TH /></TR></THead>
          <TBody>
            {members.map((m) => (
              <TR key={m.id}>
                <TD className="font-medium">{m.user.name}</TD>
                <TD>{m.user.email}</TD>
                <TD className="tabular">{date(m.user.lastLoginAt)}</TD>
                <TD>
                  {m.userId === ctx.user.id ? ROLE_LABELS[m.role] : (
                    <ActionForm action={changeRoleAction} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={m.id} />
                      <Select name="role" defaultValue={m.role} className="h-8 w-52" aria-label="Role">{roles.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                      <SubmitButton size="sm" variant="outline">Update</SubmitButton>
                    </ActionForm>
                  )}
                </TD>
                <TD className="text-right">{m.userId !== ctx.user.id && <ActionButton action={removeMemberAction} fields={{ id: m.id }} variant="ghost" size="sm" confirm="Remove this user's access to the company?">Remove</ActionButton>}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <Card className="max-w-3xl">
        <CardHeader><CardTitle>Add a user</CardTitle><CardDescription>To give employees self-service access, use “Enable self-service” on their employee page.</CardDescription></CardHeader>
        <CardContent>
          <ActionForm action={inviteUserAction} className="grid items-end gap-3 sm:grid-cols-4" resetOnSuccess>
            <Field label="Name" htmlFor="name"><Input id="name" name="name" /><FieldError name="name" /></Field>
            <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" /><FieldError name="email" /></Field>
            <Field label="Role" htmlFor="role"><Select id="role" name="role" defaultValue="PAYROLL_MANAGER">{roles.filter(([k]) => k !== "EMPLOYEE").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <SubmitButton>Add user</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
