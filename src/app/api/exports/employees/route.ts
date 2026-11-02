import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getI18n } from "@/lib/server/i18n";
import { csvResponse, dec } from "@/lib/server/csv";
import { withPermission } from "@/lib/server/route-auth";

export async function GET() {
  return withPermission("employees.view", async (ctx) => {
    const { t } = await getI18n();
    const salary = can(ctx.role, "employees.viewSalary");
    const list = await db.employee.findMany({ where: { companyId: ctx.company.id }, include: { department: true, contracts: { orderBy: { startDate: "desc" }, take: 1 } }, orderBy: { employeeNumber: "asc" } });
    const header = [t("csv.employeeNo"), t("csv.firstName"), t("csv.lastName"), t("csv.idNumber"), t("csv.email"), t("csv.phone"), t("csv.district"), t("csv.department"), t("csv.jobTitle"), t("csv.hireDate"), t("csv.status"), t("csv.bank"), t("csv.bankAccount"),
      ...(salary ? [t("csv.payType"), t("csv.salaryCurrency"), t("csv.monthlySalary"), t("csv.hourlyRate"), t("csv.paymentCurrency")] : [])];
    const rows = list.map((e) => {
      const c = e.contracts[0];
      return [e.employeeNumber, e.firstName, e.lastName, e.idNumber, e.email, e.phone, e.district, e.department?.name, e.jobTitle, e.hireDate.toISOString().slice(0, 10), t(`status.${e.status}`), e.bankName, e.bankAccount,
        ...(salary ? [c ? t(`enums.payType.${c.payType}`) : "", c?.salaryCurrency, c ? dec(c.baseSalary) : "", c ? dec(c.hourlyRate) : "", e.paymentCurrency ?? c?.salaryCurrency]  : [])];
    });
    return csvResponse([header, ...rows], `employees-${ctx.company.name}.csv`);
  });
}
