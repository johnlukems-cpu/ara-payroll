import Link from "next/link";
import { db } from "@/lib/db";
import { requireSelf } from "@/lib/server/self-service";
import { leaveBalances } from "@/lib/server/leave-balance";
import { money, periodLabel } from "@/lib/format";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader, Stat } from "@/components/ui/misc";
import { NoProfile } from "./no-profile";

export const metadata = { title: "My payroll" };

export default async function MePage() {
  const { ctx, employee } = await requireSelf();
  if (!employee) return <NoProfile />;
  const [latest, balances, pending] = await Promise.all([
    db.payslip.findFirst({ where: { employeeId: employee.id, run: { status: { in: ["APPROVED", "PAID"] } } }, include: { run: true }, orderBy: [{ run: { year: "desc" } }, { run: { month: "desc" } }] }),
    leaveBalances(ctx.company!.id, employee.id, new Date().getUTCFullYear()),
    db.leaveRequest.count({ where: { employeeId: employee.id, status: "PENDING" } }),
  ]);
  const vac = balances[0];
  return (
    <div>
      <PageHeader title={`Welcome, ${employee.firstName}`} description={`${ctx.company!.name} · ${employee.jobTitle ?? ""}`} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Latest net pay" value={latest ? money(latest.netPay) : "—"} sub={latest ? periodLabel(latest.run.year, latest.run.month) : "No payslips yet"} />
        <Stat label={vac ? `${vac.type.name} remaining` : "Leave balance"} value={vac ? `${vac.remaining} days` : "—"} sub={vac ? `${vac.taken} of ${vac.entitlement} used this year` : undefined} />
        <Stat label="Pending leave requests" value={pending} />
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        {latest && <Link href={`/me/payslips/${latest.id}`} className={buttonVariants()}>View latest payslip</Link>}
        <Link href="/me/leave" className={buttonVariants({ variant: "outline" })}>Request leave</Link>
      </div>
    </div>
  );
}
