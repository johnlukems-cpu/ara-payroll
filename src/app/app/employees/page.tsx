import Link from "next/link";
import { Plus, Search } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { can } from "@/lib/permissions";
import { buttonVariants, Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("employees.title") };
}

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; dept?: string }> }) {
  const ctx = await requirePage("employees.view");
  const { t, f } = await getI18n();
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
        title={t("employees.title")}
        description={t("employees.shown", { count: employees.length })}
        actions={
          <>
            <a href="/api/exports/employees" className={buttonVariants({ variant: "outline" })}>{t("common.exportCsv")}</a>
            {can(ctx.role, "employees.edit") && <Link href="/app/employees/new" className={buttonVariants()}><Plus /> {t("employees.add")}</Link>}
          </>
        }
      />
      <Card>
        <form className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input name="q" placeholder={t("employees.searchPlaceholder")} defaultValue={sp.q} className="pl-9" aria-label={t("employees.search")} />
          </div>
          <Select name="status" defaultValue={sp.status ?? ""} className="w-44" aria-label={t("employees.cols.status")}>
            <option value="">{t("employees.currentStaff")}</option>
            {["ACTIVE", "ON_LEAVE", "TERMINATED"].map((s) => <option key={s} value={s}>{t(`status.${s}` as never)}</option>)}
          </Select>
          <Select name="dept" defaultValue={sp.dept ?? ""} className="w-44" aria-label={t("employees.cols.department")}>
            <option value="">{t("employees.allDepartments")}</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Button variant="secondary" type="submit">{t("common.filter")}</Button>
        </form>
        {employees.length === 0 ? (
          <EmptyState title={t("employees.noneFound")} description={t("employees.noneFoundText")} />
        ) : (
          <Table>
            <THead>
              <TR><TH>{t("employees.cols.number")}</TH><TH>{t("employees.cols.name")}</TH><TH>{t("employees.cols.jobTitle")}</TH><TH>{t("employees.cols.department")}</TH><TH>{t("employees.cols.hired")}</TH>{showSalary && <TH className="text-right">{t("employees.cols.salary")}</TH>}<TH>{t("employees.cols.status")}</TH></TR>
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
                    <TD className="tabular">{f.date(e.hireDate)}</TD>
                    {showSalary && <TD className="tabular text-right">{c ? (c.payType === "MONTHLY" ? f.money(c.baseSalary, c.salaryCurrency) : `${f.money(c.hourlyRate, c.salaryCurrency)}${t("common.perHour")}`) : "—"}</TD>}
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
