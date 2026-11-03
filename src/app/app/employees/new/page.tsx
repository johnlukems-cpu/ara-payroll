import { nextEmployeeNumber } from "@/lib/server/employee-number";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { getCurrencies } from "@/lib/server/rates";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { PageHeader } from "@/components/ui/misc";
import { createEmployeeAction } from "@/app/actions/employees";
import { ContractFields, EmployeeFields } from "../fields";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("employees.addTitle") };
}

export default async function NewEmployeePage() {
  const ctx = await requirePage("employees.edit");
  const { t } = await getI18n();
  const [departments, employeeNumber, currencies] = await Promise.all([
    db.department.findMany({ where: { companyId: ctx.company.id }, orderBy: { name: "asc" } }),
    nextEmployeeNumber(ctx.company.id),
    getCurrencies(),
  ]);
  return (
    <div>
      <PageHeader title={t("employees.addTitle")} description={t("employees.addSubtitle")} />
      <ActionForm action={createEmployeeAction} className="space-y-5">
        <EmployeeFields e={{ employeeNumber }} departments={departments} currencies={currencies} />
        <fieldset className="rounded-xl border bg-card p-5">
          <legend className="px-1 text-sm font-semibold">{t("employees.contractSection")}</legend>
          <p className="mb-4 text-xs text-muted-foreground">{t("employees.contractHint")}</p>
          <ContractFields prefixStart="contractStart" currencies={currencies} defaultCurrency={ctx.company.currency} />
        </fieldset>
        <div className="flex justify-end"><SubmitButton>{t("employees.create")}</SubmitButton></div>
      </ActionForm>
    </div>
  );
}
