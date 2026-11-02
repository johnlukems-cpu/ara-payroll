import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { csvResponse, dec } from "@/lib/server/csv";
import { withPermission } from "@/lib/server/route-auth";

export async function GET() {
  return withPermission("employees.view", async (ctx) => {
    const salary = can(ctx.role, "employees.viewSalary");
    const list = await db.employee.findMany({ where: { companyId: ctx.company.id }, include: { department: true, contracts: { orderBy: { startDate: "desc" }, take: 1 } }, orderBy: { employeeNumber: "asc" } });
    const header = ["Employee no.", "First name", "Last name", "ID number", "Email", "Phone", "District", "Department", "Job title", "Hire date", "Status", "Bank", "Bank account", ...(salary ? ["Pay type", "Monthly salary", "Hourly rate"] : [])];
    const rows = list.map((e) => {
      const c = e.contracts[0];
      return [e.employeeNumber, e.firstName, e.lastName, e.idNumber, e.email, e.phone, e.district, e.department?.name, e.jobTitle, e.hireDate.toISOString().slice(0, 10), e.status, e.bankName, e.bankAccount,
        ...(salary ? [c?.payType, c ? dec(c.baseSalary) : "", c ? dec(c.hourlyRate) : ""] : [])];
    });
    return csvResponse([header, ...rows], `employees-${ctx.company.name}.csv`);
  });
}
