import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { PageHeader } from "@/components/ui/misc";
import { createEmployeeAction } from "@/app/actions/employees";
import { ContractFields, EmployeeFields } from "../fields";

export const metadata = { title: "Add employee" };

export default async function NewEmployeePage() {
  const ctx = await requirePage("employees.edit");
  const [departments, count] = await Promise.all([
    db.department.findMany({ where: { companyId: ctx.company.id }, orderBy: { name: "asc" } }),
    db.employee.count({ where: { companyId: ctx.company.id } }),
  ]);
  const suggested = { employeeNumber: String(1001 + count) } as never;
  return (
    <div>
      <PageHeader title="Add employee" description="Register a new employee with their first employment contract." />
      <ActionForm action={createEmployeeAction} className="space-y-5">
        <EmployeeFields e={suggested} departments={departments} />
        <fieldset className="rounded-xl border bg-card p-5">
          <legend className="px-1 text-sm font-semibold">Employment contract & salary</legend>
          <p className="mb-4 text-xs text-muted-foreground">The contract start date defaults to the hire date when left empty.</p>
          <ContractFields prefixStart="contractStart" />
        </fieldset>
        <div className="flex justify-end"><SubmitButton>Create employee</SubmitButton></div>
      </ActionForm>
    </div>
  );
}
