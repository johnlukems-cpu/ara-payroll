import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/server/admin-page";
import { getI18n } from "@/lib/server/i18n";
import { currentSubscriptions } from "@/lib/server/saas";
import { monthlyRevenue } from "@/lib/saas";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("saas.nav.reports") };
}

const ym = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/** Reports from real database records: revenue per month (invoiced vs. received), new and cancelled customers, MRR per plan. */
export default async function ReportsPage() {
  await requireAdminPage();
  const { t, f, locale } = await getI18n();
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const [invoices, payments, orgs, cancelled, subs, plans] = await Promise.all([
    db.invoice.findMany({ where: { issueDate: { gte: from } }, select: { issueDate: true, total: true, currency: true } }),
    db.payment.findMany({ where: { paidAt: { gte: from } }, select: { paidAt: true, amount: true, currency: true } }),
    db.organization.findMany({ where: { createdAt: { gte: from } }, select: { createdAt: true } }),
    db.subscription.findMany({ where: { cancelledAt: { gte: from } }, select: { cancelledAt: true } }),
    currentSubscriptions(),
    db.plan.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  const months = Array.from({ length: 12 }, (_, i) => ym(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + i, 1))));
  type Row = { invoiced: Record<string, number>; received: Record<string, number>; newCustomers: number; cancelled: number };
  const rows = new Map<string, Row>(months.map((m) => [m, { invoiced: {}, received: {}, newCustomers: 0, cancelled: 0 }]));
  for (const i of invoices) { const r = rows.get(ym(i.issueDate)); if (r) r.invoiced[i.currency] = (r.invoiced[i.currency] ?? 0) + i.total; }
  for (const p of payments) { const r = rows.get(ym(p.paidAt)); if (r) r.received[p.currency] = (r.received[p.currency] ?? 0) + p.amount; }
  for (const o of orgs) { const r = rows.get(ym(o.createdAt)); if (r) r.newCustomers++; }
  for (const s of cancelled) { const r = s.cancelledAt && rows.get(ym(s.cancelledAt)); if (r) r.cancelled++; }
  const fmt = (m: Record<string, number>) => (Object.keys(m).length ? Object.entries(m).map(([c, v]) => f.money(v, c)).join(" · ") : "—");
  const perPlan = plans.map((p) => {
    const list = subs.filter((s) => s.planId === p.id);
    const mrr: Record<string, number> = {};
    for (const s of list) { const v = monthlyRevenue(s); if (v) mrr[s.currency] = (mrr[s.currency] ?? 0) + v; }
    return { p, active: list.filter((s) => s.status === "ACTIVE" || s.status === "PAST_DUE").length, trial: list.filter((s) => s.status === "TRIAL").length, ended: list.filter((s) => ["CANCELLED", "EXPIRED"].includes(s.status)).length, mrr };
  });

  return (
    <div className="space-y-6">
      <PageHeader title={t("saas.reports.title")} description={t("saas.reports.subtitle")} />
      <Card>
        <CardHeader><CardTitle>{t("saas.reports.perMonth")}</CardTitle><CardDescription>{t("saas.reports.perMonthHint")}</CardDescription></CardHeader>
        <Table data-testid="report-months">
          <THead><TR><TH>{t("saas.reports.month")}</TH><TH className="text-right">{t("saas.reports.invoiced")}</TH><TH className="text-right">{t("saas.reports.received")}</TH><TH className="text-right">{t("saas.reports.newCustomers")}</TH><TH className="text-right">{t("saas.reports.cancellations")}</TH></TR></THead>
          <TBody>
            {months.slice().reverse().map((m) => {
              const r = rows.get(m)!;
              return <TR key={m}><TD className="tabular">{f.period(Number(m.slice(0, 4)), Number(m.slice(5)))}</TD><TD className="tabular text-right">{fmt(r.invoiced)}</TD><TD className="tabular text-right">{fmt(r.received)}</TD><TD className="tabular text-right">{r.newCustomers}</TD><TD className="tabular text-right">{r.cancelled}</TD></TR>;
            })}
          </TBody>
        </Table>
      </Card>
      <Card>
        <CardHeader><CardTitle>{t("saas.reports.perPlan")}</CardTitle><CardDescription>{t("saas.dashboard.mrrNote")}</CardDescription></CardHeader>
        <Table>
          <THead><TR><TH>{t("saas.customers.cols.plan")}</TH><TH className="text-right">{t("saas.dashboard.activeSubs")}</TH><TH className="text-right">{t("saas.dashboard.trialSubs")}</TH><TH className="text-right">{t("saas.reports.ended")}</TH><TH className="text-right">{t("saas.dashboard.mrr")}</TH></TR></THead>
          <TBody>
            {perPlan.map(({ p, active, trial, ended, mrr }) => <TR key={p.id}><TD>{locale === "en" ? p.nameEn : p.nameNl}</TD><TD className="tabular text-right">{active}</TD><TD className="tabular text-right">{trial}</TD><TD className="tabular text-right">{ended}</TD><TD className="tabular text-right">{fmt(mrr)}</TD></TR>)}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
