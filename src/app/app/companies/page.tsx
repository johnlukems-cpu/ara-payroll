import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { ActionForm, FieldError } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { switchCompanyAction } from "@/app/actions/auth";
import { createCompanyAction } from "@/app/actions/settings";

export const metadata = { title: "Companies" };

export default async function CompaniesPage() {
  const ctx = await requirePage();
  const counts = await db.employee.groupBy({ by: ["companyId"], where: { companyId: { in: ctx.memberships.map((m) => m.companyId) }, status: { not: "TERMINATED" } }, _count: true });
  return (
    <div>
      <PageHeader title="Companies" description="Manage payroll for multiple employers from one account — ideal for groups and accounting firms." />
      <Card>
        <Table>
          <THead><TR><TH>Company</TH><TH>Your role</TH><TH className="text-right">Employees</TH><TH /></TR></THead>
          <TBody>
            {ctx.memberships.map((m) => (
              <TR key={m.id}>
                <TD className="font-medium">{m.company.name} {m.companyId === ctx.company.id && <Badge variant="accent" className="ml-1">Active</Badge>}</TD>
                <TD>{ROLE_LABELS[m.role]}</TD>
                <TD className="tabular text-right">{counts.find((c) => c.companyId === m.companyId)?._count ?? 0}</TD>
                <TD className="text-right">
                  {m.companyId !== ctx.company.id && (
                    <form action={switchCompanyAction}><input type="hidden" name="companyId" value={m.companyId} /><button className="text-sm text-primary hover:underline">Switch</button></form>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      {can(ctx.role, "company.manage") && (
        <Card className="mt-6 max-w-xl">
          <CardHeader><CardTitle>Add a company</CardTitle><CardDescription>Created in the same organisation, with default Surinamese payroll configuration.</CardDescription></CardHeader>
          <CardContent>
            <ActionForm action={createCompanyAction} className="flex gap-2" resetOnSuccess>
              <div className="flex-1"><Input name="name" placeholder="Company name" aria-label="Company name" /><FieldError name="name" /></div>
              <SubmitButton>Create</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
