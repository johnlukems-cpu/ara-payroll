import Link from "next/link";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { can } from "@/lib/permissions";
import { leaveBalancesFor } from "@/lib/server/leave-balance";
import { adjustLeaveBalanceAction } from "@/app/actions/leave";
import { OpField, OpForm } from "@/components/admin-op-form";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("leave.tabs.overview") };
}

/** Leave balances per employee (with manual corrections) and leave / absence taken per department. */
export default async function LeaveOverviewPage({ searchParams }: { searchParams: Promise<{ year?: string; dept?: string }> }) {
  const ctx = await requirePage("leave.view");
  const { t, f } = await getI18n();
  const sp = await searchParams;
  const year = Number(sp.year) >= 2000 && Number(sp.year) <= 2100 ? Number(sp.year) : new Date().getUTCFullYear();
  const companyId = ctx.company.id;
  const canAdjust = can(ctx.role, "leave.approve");
  const [departments, employees, types, taken, adjustments] = await Promise.all([
    db.department.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    db.employee.findMany({ where: { companyId, status: { not: "TERMINATED" }, ...(sp.dept ? { departmentId: sp.dept } : {}) }, include: { department: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    db.leaveType.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    db.leaveRequest.findMany({ where: { employee: { companyId }, status: "APPROVED", startDate: { gte: new Date(Date.UTC(year, 0, 1)), lte: new Date(Date.UTC(year, 11, 31)) } }, select: { leaveTypeId: true, days: true, approvedDays: true, employee: { select: { departmentId: true } } } }),
    db.leaveBalanceAdjustment.findMany({ where: { employee: { companyId }, year }, include: { employee: true, leaveType: true }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const balances = await leaveBalancesFor(companyId, employees.map((e) => e.id), year);
  const annualTypes = types.filter((ty) => ty.annualEntitlementDays > 0);
  const deptRows = [...departments.map((d) => ({ id: d.id as string | null, name: d.name })), { id: null, name: t("reports.unassigned") }]
    .map((d) => ({ ...d, perType: types.map((ty) => taken.filter((r) => r.leaveTypeId === ty.id && (r.employee.departmentId ?? null) === d.id).reduce((s, r) => s + (r.approvedDays ?? r.days), 0)) }))
    .filter((d) => d.perType.some((v) => v > 0));
  const usedTypes = types.filter((_, i) => deptRows.some((d) => d.perType[i] > 0));

  return (
    <div className="space-y-6">
      <PageHeader title={t("leave.overview.title", { year })} description={t("leave.overview.subtitle")} />
      <form className="flex flex-wrap items-end gap-3">
        <Input name="year" type="number" min={2000} max={2100} defaultValue={year} className="w-28" aria-label={t("leave.overview.year")} />
        <Select name="dept" defaultValue={sp.dept ?? ""} className="w-56" aria-label={t("employees.cols.department")}>
          <option value="">{t("leave.calendar.allDepartments")}</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
        <Button type="submit" variant="secondary">{t("common.show")}</Button>
      </form>

      <Card>
        <CardHeader><CardTitle>{t("leave.overview.balances")}</CardTitle><CardDescription>{t("leave.overview.balancesSub")}</CardDescription></CardHeader>
        {annualTypes.length === 0 || employees.length === 0 ? <EmptyState title={t("reports.noData")} /> : (
          <Table data-testid="leave-balances">
            <THead><TR><TH>{t("employees.cols.name")}</TH>{annualTypes.map((ty) => <TH key={ty.id} className="text-right">{ty.name}</TH>)}</TR></THead>
            <TBody>
              {employees.map((e) => (
                <TR key={e.id}>
                  <TD><Link href={`/app/employees/${e.id}?tab=leave`} className="font-medium hover:underline">{e.firstName} {e.lastName}</Link><span className="block text-xs text-muted-foreground">{e.department?.name ?? ""}</span></TD>
                  {annualTypes.map((ty) => {
                    const b = balances.get(e.id)?.find((x) => x.type.id === ty.id);
                    return <TD key={ty.id} className="tabular text-right text-sm">{b ? <><span className="font-medium">{f.number(b.remaining, 1)}</span><span className="block text-[11px] text-muted-foreground">{t("leave.overview.cell", { entitlement: f.number(b.entitlement, 1), taken: f.number(b.taken, 1) })}{b.adjusted ? ` · ${b.adjusted > 0 ? "+" : ""}${f.number(b.adjusted, 1)}` : ""}</span></> : "—"}</TD>;
                  })}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {canAdjust && employees.length > 0 && annualTypes.length > 0 && (
        <div className="max-w-2xl">
          <OpForm action={adjustLeaveBalanceAction} title={t("leave.overview.adjustTitle")} submit={t("common.save")} hidden={{ year: String(year) }} testId="leave-adjust">
            <OpField label={t("employees.cols.name")}><Select name="employeeId">{employees.map((e) => <option key={e.id} value={e.id}>{e.lastName}, {e.firstName}</option>)}</Select></OpField>
            <OpField label={t("leave.cols.type")}><Select name="leaveTypeId">{annualTypes.map((ty) => <option key={ty.id} value={ty.id}>{ty.name}</option>)}</Select></OpField>
            <OpField label={t("leave.overview.adjustDays")}><Input name="days" inputMode="decimal" required /></OpField>
            <OpField label={t("leave.overview.adjustReason")}><Input name="reason" required /></OpField>
            <p className="text-xs text-muted-foreground sm:col-span-2">{t("leave.overview.adjustHint", { year })}</p>
          </OpForm>
        </div>
      )}

      {adjustments.length > 0 && (
        <Card>
          <CardHeader><CardTitle>{t("leave.overview.adjustments")}</CardTitle></CardHeader>
          <Table data-testid="leave-adjustments">
            <TBody>
              {adjustments.map((a) => <TR key={a.id}><TD className="whitespace-nowrap text-xs">{f.date(a.createdAt)}</TD><TD className="text-sm">{a.employee.firstName} {a.employee.lastName}</TD><TD className="text-sm">{a.leaveType.name}</TD><TD className="tabular text-right">{a.days > 0 ? "+" : ""}{f.number(a.days, 1)}</TD><TD className="text-sm text-muted-foreground">{a.reason}</TD></TR>)}
            </TBody>
          </Table>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>{t("leave.overview.perDepartment")}</CardTitle><CardDescription>{t("leave.overview.perDepartmentSub")}</CardDescription></CardHeader>
        {deptRows.length === 0 ? <EmptyState title={t("reports.noData")} /> : (
          <Table data-testid="leave-per-department">
            <THead><TR><TH>{t("employees.cols.department")}</TH>{usedTypes.map((ty) => <TH key={ty.id} className="text-right">{ty.name}</TH>)}<TH className="text-right">{t("common.total")}</TH></TR></THead>
            <TBody>
              {deptRows.map((d) => (
                <TR key={d.id ?? "none"}>
                  <TD>{d.name}</TD>
                  {types.map((ty, i) => usedTypes.includes(ty) && <TD key={ty.id} className="tabular text-right">{f.number(d.perType[i], 1)}</TD>)}
                  <TD className="tabular text-right font-medium">{f.number(d.perType.reduce((s, v) => s + v, 0), 1)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
