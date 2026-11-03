import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/server/admin-page";
import { getI18n } from "@/lib/server/i18n";
import { currentSubscriptions, processSubscriptions } from "@/lib/server/saas";
import { mrrByCurrency, trialDaysLeft } from "@/lib/saas";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, PageHeader, Stat } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { RequestBadge } from "@/components/saas-badges";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("saas.nav.dashboard") };
}

/** Administration dashboard: real figures from the database only. */
export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  await requireAdminPage();
  const { t, f } = await getI18n();
  const now = new Date();
  await processSubscriptions(now); // trial reminders, expired trials, arrears (idempotent)
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [total, active, newThisMonth, subs, openInvoices, credits, paymentsMonth, paymentsAll, requests, plans] = await Promise.all([
    db.organization.count(),
    db.organization.count({ where: { status: { in: ["ACTIVE", "TRIAL", "PAYMENT_DUE"] } } }),
    db.organization.count({ where: { createdAt: { gte: monthStart } } }),
    currentSubscriptions(),
    db.invoice.findMany({ where: { kind: "INVOICE", status: { in: ["OPEN", "PARTIALLY_PAID"] } }, select: { id: true, total: true, amountPaid: true, currency: true } }),
    db.invoice.groupBy({ by: ["creditForId"], where: { kind: "CREDIT_NOTE" }, _sum: { total: true } }),
    db.payment.groupBy({ by: ["currency"], where: { paidAt: { gte: monthStart } }, _sum: { amount: true }, _count: true }),
    db.payment.groupBy({ by: ["currency"], _sum: { amount: true } }),
    db.contactRequest.findMany({ where: { status: { in: ["NEW", "IN_REVIEW", "INFO_REQUESTED", "DEMO_SCHEDULED"] } }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.plan.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  const creditOf = new Map(credits.map((c) => [c.creditForId, -(c._sum.total ?? 0)]));
  const outstanding: Record<string, number> = {};
  for (const i of openInvoices) outstanding[i.currency] = (outstanding[i.currency] ?? 0) + i.total - i.amountPaid - (creditOf.get(i.id) ?? 0);
  const count = (st: string[]) => subs.filter((s) => st.includes(s.status)).length;
  const mrr = mrrByCurrency(subs);
  const byCur = (m: Record<string, number>) => (Object.keys(m).length ? Object.entries(m).map(([c, v]) => f.money(v, c)).join(" · ") : f.money(0, "SRD"));
  const trialsEnding = subs.filter((s) => s.status === "TRIAL").sort((a, b) => (a.trialEnd?.getTime() ?? 0) - (b.trialEnd?.getTime() ?? 0)).slice(0, 5);
  const perPlan = plans.map((p) => ({ plan: p, count: subs.filter((s) => s.planId === p.id && !["CANCELLED", "EXPIRED"].includes(s.status)).length }));
  const maxPlan = Math.max(1, ...perPlan.map((p) => p.count));

  return (
    <div className="space-y-6">
      <PageHeader title={t("saas.dashboard.title")} description={t("saas.dashboard.subtitle")} />
      {(await searchParams).denied && <Alert variant="error">{t("dashboard.denied")}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="admin-stats">
        <Stat label={t("saas.dashboard.totalCustomers")} value={total} />
        <Stat label={t("saas.dashboard.activeCustomers")} value={active} />
        <Stat label={t("saas.dashboard.newCustomers")} value={newThisMonth} />
        <Stat label={t("saas.dashboard.activeSubs")} value={count(["ACTIVE", "PAST_DUE"])} />
        <Stat label={t("saas.dashboard.trialSubs")} value={count(["TRIAL"])} />
        <Stat label={t("saas.dashboard.cancelledSubs")} value={count(["CANCELLED"])} />
        <Stat label={t("saas.dashboard.expiredSubs")} value={count(["EXPIRED"])} />
        <Stat label={t("saas.dashboard.openInvoices")} value={openInvoices.length} sub={byCur(outstanding)} />
        <Stat label={t("saas.dashboard.paymentsMonth")} value={byCur(Object.fromEntries(paymentsMonth.map((p) => [p.currency, p._sum.amount ?? 0])))} sub={t("saas.dashboard.paymentsTotal", { amount: byCur(Object.fromEntries(paymentsAll.map((p) => [p.currency, p._sum.amount ?? 0]))) })} />
        <Stat label={t("saas.dashboard.mrr")} value={byCur(mrr)} />
        <Stat label={t("saas.dashboard.arr")} value={byCur(Object.fromEntries(Object.entries(mrr).map(([c, v]) => [c, v * 12])))} />
      </div>
      <p className="text-xs text-muted-foreground">{t("saas.dashboard.mrrNote")}</p>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>{t("saas.dashboard.perPlan")}</CardTitle></CardHeader>
          <CardContent className="space-y-3" data-testid="plan-distribution">
            {perPlan.map(({ plan, count: n }) => (
              <div key={plan.id}>
                <div className="flex justify-between text-sm"><span>{plan.nameNl}</span><span className="tabular font-medium">{n}</span></div>
                <div className="mt-1 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${(n / maxPlan) * 100}%` }} /></div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("saas.dashboard.openRequests")}</CardTitle><CardDescription><Link href="/admin/requests" className="text-primary hover:underline">{t("saas.dashboard.allRequests")}</Link></CardDescription></CardHeader>
          <Table><TBody>
            {requests.length === 0 && <TR><TD className="text-sm text-muted-foreground">{t("saas.none")}</TD></TR>}
            {requests.map((r) => <TR key={r.id}><TD>{r.company}<span className="block text-xs text-muted-foreground">{t(`saas.requestType.${r.type}`)} · {f.date(r.createdAt)}</span></TD><TD className="text-right"><RequestBadge status={r.status} /></TD></TR>)}
          </TBody></Table>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("saas.dashboard.trialsEnding")}</CardTitle><CardDescription><Link href="/admin/trials" className="text-primary hover:underline">{t("saas.nav.trials")}</Link></CardDescription></CardHeader>
          <Table><TBody>
            {trialsEnding.length === 0 && <TR><TD className="text-sm text-muted-foreground">{t("saas.none")}</TD></TR>}
            {trialsEnding.map((s) => <TR key={s.id}><TD><Link href={`/admin/customers/${s.organizationId}`} className="hover:underline">{s.organization.name}</Link></TD><TD className="tabular text-right text-sm">{t("saas.daysLeft", { days: trialDaysLeft(s.trialEnd, now) ?? 0 })}</TD></TR>)}
          </TBody></Table>
        </Card>
      </div>
    </div>
  );
}
