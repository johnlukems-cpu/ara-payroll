import Link from "next/link";
import { db } from "@/lib/db";
import { requireSelf } from "@/lib/server/self-service";
import { leaveBalances } from "@/lib/server/leave-balance";
import { getI18n } from "@/lib/server/i18n";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader, Stat } from "@/components/ui/misc";
import { NoProfile } from "./no-profile";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("me.title") };
}

export default async function MePage() {
  const { ctx, employee } = await requireSelf();
  if (!employee) return <NoProfile />;
  const { t, f } = await getI18n();
  const [latest, balances, pending] = await Promise.all([
    db.payslip.findFirst({ where: { employeeId: employee.id, run: { status: { in: ["APPROVED", "PAID"] } } }, include: { run: true }, orderBy: [{ run: { year: "desc" } }, { run: { month: "desc" } }] }),
    leaveBalances(ctx.company!.id, employee.id, new Date().getUTCFullYear()),
    db.leaveRequest.count({ where: { employeeId: employee.id, status: "PENDING" } }),
  ]);
  const vac = balances[0];
  return (
    <div>
      <PageHeader title={t("me.welcome", { name: employee.firstName })} description={`${ctx.company!.name}${employee.jobTitle ? ` · ${employee.jobTitle}` : ""}`} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t("me.latestNet")} value={latest ? f.money(latest.netPayPayment, latest.paymentCurrency) : "—"} sub={latest ? f.period(latest.run.year, latest.run.month) : t("me.noPayslips")} />
        <Stat label={vac ? t("me.leaveRemaining", { type: vac.type.name }) : t("me.leaveBalance")} value={vac ? t("me.daysCount", { days: f.number(vac.remaining) }) : "—"} sub={vac ? t("me.usedOf", { taken: f.number(vac.taken), total: f.number(vac.entitlement) }) : undefined} />
        <Stat label={t("me.pendingLeave")} value={pending} />
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        {latest && <Link href={`/me/payslips/${latest.id}`} className={buttonVariants()}>{t("me.viewLatest")}</Link>}
        <Link href="/me/leave" className={buttonVariants({ variant: "outline" })}>{t("me.requestLeave")}</Link>
      </div>
    </div>
  );
}
