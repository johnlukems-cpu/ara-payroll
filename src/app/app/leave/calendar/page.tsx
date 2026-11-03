import Link from "next/link";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { SR_FIXED_HOLIDAYS } from "@/lib/leave";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("leave.tabs.calendar") };
}

/** Month calendar of approved and pending leave per employee (weekends and fixed public holidays shaded). */
export default async function LeaveCalendarPage({ searchParams }: { searchParams: Promise<{ month?: string; dept?: string }> }) {
  const ctx = await requirePage("leave.view");
  const { t, f } = await getI18n();
  const sp = await searchParams;
  const now = new Date();
  const [y, m] = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month!.split("-").map(Number) : [now.getUTCFullYear(), now.getUTCMonth() + 1];
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  const days = end.getUTCDate();
  const companyId = ctx.company.id;
  const [departments, requests] = await Promise.all([
    db.department.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    db.leaveRequest.findMany({
      where: { employee: { companyId, ...(sp.dept ? { departmentId: sp.dept } : {}) }, status: { in: ["APPROVED", "PENDING"] }, startDate: { lte: end }, endDate: { gte: start } },
      include: { employee: { include: { department: true } }, leaveType: true }, orderBy: [{ employee: { lastName: "asc" } }, { startDate: "asc" }],
    }),
  ]);
  const people = [...new Map(requests.map((r) => [r.employeeId, r.employee])).values()];
  const shift = (n: number) => { const d = new Date(Date.UTC(y, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
  const qs = (month: string) => `?month=${month}${sp.dept ? `&dept=${sp.dept}` : ""}`;
  const dayInfo = Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1, i + 1));
    const md = `${String(m).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
    return { n: i + 1, off: d.getUTCDay() === 0 || d.getUTCDay() === 6 || SR_FIXED_HOLIDAYS.includes(md) };
  });
  const cellFor = (empId: string, day: number) => {
    const d = Date.UTC(y, m - 1, day);
    return requests.find((r) => r.employeeId === empId && r.startDate.getTime() <= d && r.endDate.getTime() >= d);
  };

  return (
    <div className="space-y-4">
      <PageHeader title={t("leave.calendar.title", { period: f.period(y, m) })} description={t("leave.calendar.subtitle")} actions={
        <div className="flex gap-2">
          <Link href={qs(shift(-1))} className={buttonVariants({ variant: "outline", size: "sm" })}>←</Link>
          <Link href={qs(shift(1))} className={buttonVariants({ variant: "outline", size: "sm" })}>→</Link>
        </div>
      } />
      <form className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="month" value={`${y}-${String(m).padStart(2, "0")}`} />
        <Select name="dept" defaultValue={sp.dept ?? ""} className="w-56" aria-label={t("employees.cols.department")}>
          <option value="">{t("leave.calendar.allDepartments")}</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
        <Button type="submit" variant="secondary">{t("common.show")}</Button>
      </form>
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-primary" /> {t("status.APPROVED")}</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-warning/70" /> {t("status.PENDING")}</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-muted" /> {t("leave.calendar.nonWorking")}</span>
      </div>
      <Card>
        {people.length === 0 ? <EmptyState title={t("leave.calendar.empty")} /> : (
          <div className="overflow-x-auto" data-testid="leave-calendar">
            <table className="text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-44 bg-card px-3 py-2 text-left font-semibold">{t("employees.cols.name")}</th>
                  {dayInfo.map((d) => <th key={d.n} className={cn("w-7 px-0.5 py-2 text-center font-medium tabular", d.off && "text-muted-foreground")}>{d.n}</th>)}
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="sticky left-0 z-10 bg-card px-3 py-1.5"><Link href={`/app/employees/${p.id}?tab=leave`} className="font-medium hover:underline">{p.firstName} {p.lastName}</Link><span className="block text-[11px] text-muted-foreground">{p.department?.name ?? ""}</span></td>
                    {dayInfo.map((d) => {
                      const r = cellFor(p.id, d.n);
                      return <td key={d.n} className={cn("h-8 border-l p-0.5", d.off && "bg-muted/60")} title={r ? `${r.leaveType.name} (${t(`status.${r.status}`)})` : undefined}>
                        {r && <span className={cn("block h-full w-full rounded-sm", r.status === "APPROVED" ? "bg-primary" : "bg-warning/70")} />}
                      </td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
