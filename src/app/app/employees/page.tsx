import Link from "next/link";
import { Plus, Search } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { can } from "@/lib/permissions";
import { date, money } from "@/lib/format";
import { buttonVariants, Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const metadata = { title: "Employees" };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; dept?: string }> }) {
  const ctx = await requirePage("employees.view");
  const sp = await searchParams;
  const showSalary = can(ctx.role, "employees.viewSalary");
  const where: Prisma.EmployeeWhereInput = { companyId: ctx.company.id };
  if (sp.q) {
    where.OR = [
      { firstName: { contains: sp.q, mode: "insensitive" } },
      { lastName: { contains: sp.q, mode: "insensitive" } },
      { employeeNumber: { contains: sp.q, mode: "insensitive" } },
      { jobTitle: { contains: sp.q, mode: "insensitive" } },
    ];
  }
  if (sp.status && ["ACTIVE", "ON_LEAVE", "TERMINATED"].includes(sp.status)) where.status = sp.status as "ACTIVE";
  else if (!sp.status) where.status = { not: "TERMINATED" };
  if (sp.dept) where.departmentId = sp.dept;

  const [employees, departments] = await Promise.all([
    db.employee.findMany({
      where,
      include: { department: true, contracts: { orderBy: { startDate: "desc" }, take: 1 } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 500,
    }),
    db.department.findMany({ where: { companyId: ctx.company.id }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Employees"
        description={`${employees.length} employee${employees.length === 1 ? "" : "s"} shown`}
        actions={
          <>
            <a href="/api/exports/employees" className={buttonVariants({ variant: "outline" })}>Export CSV</a>
            {can(ctx.role, "employees.edit") && <Link href="/app/employees/new" className={buttonVariants()}><Plus /> Add employee</Link>}
          </>
        }
      />
      <Card>
        <form className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input name="q" placeholder="Search name, number or job title" defaultValue={sp.q} className="pl-9" aria-label="Search employees" />
          </div>
          <Select name="status" defaultValue={sp.status ?? ""} className="w-40" aria-label="Status">
            <option value="">Current staff</option>
            <option value="ACTIVE">Active</option>
            <option value="ON_LEAVE">On leave</option>
            <option value="TERMINATED">Terminated</option>
          </Select>
          <Select name="dept" defaultValue={sp.dept ?? ""} className="w-44" aria-label="Department">
            <option value="">All departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Button variant="secondary" type="submit">Filter</Button>
        </form>
        {employees.length === 0 ? (
          <EmptyState title="No employees found" description="Add your first employee to start running payroll." />
        ) : (
          <Table>
            <THead>
              <TR><TH>No.</TH><TH>Name</TH><TH>Job title</TH><TH>Department</TH><TH>Hired</TH>{showSalary && <TH className="text-right">Salary</TH>}<TH>Status</TH></TR>
            </THead>
            <TBody>
              {employees.map((e) => {
                const c = e.contracts[0];
                return (
                  <TR key={e.id}>
                    <TD className="tabular text-muted-foreground">{e.employeeNumber}</TD>
                    <TD><Link href={`/app/employees/${e.id}`} className="font-medium text-primary hover:underline">{e.lastName}, {e.firstName}</Link></TD>
                    <TD>{e.jobTitle ?? "—"}</TD>
                    <TD>{e.department?.name ?? "—"}</TD>
                    <TD className="tabular">{date(e.hireDate)}</TD>
                    {showSalary && <TD className="tabular text-right">{c ? (c.payType === "MONTHLY" ? money(c.baseSalary) : `${money(c.hourlyRate)}/h`) : "—"}</TD>}
                    <TD><StatusBadge status={e.status} /></TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
