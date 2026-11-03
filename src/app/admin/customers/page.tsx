import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/server/admin-page";
import { getI18n } from "@/lib/server/i18n";
import { isOverdue } from "@/lib/saas";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CustomerBadge, SubscriptionBadge } from "@/components/saas-badges";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("saas.nav.customers") };
}

const STATUSES = ["NEW_REQUEST", "IN_REVIEW", "ACTIVE", "TRIAL", "PAYMENT_DUE", "SUSPENDED", "CANCELLED"] as const;
const SORTS = { name: { name: "asc" }, created: { createdAt: "desc" }, status: { status: "asc" } } as const;

/** All customers with search, filters and sorting. */
export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; plan?: string; sort?: string }> }) {
  await requireAdminPage();
  const { t, f } = await getI18n();
  const sp = await searchParams;
  const q = sp.q?.trim();
  const where: Prisma.OrganizationWhereInput = {
    ...(q ? { OR: ["name", "contactName", "contactEmail", "registrationNumber", "phone"].map((k) => ({ [k]: { contains: q, mode: "insensitive" } })) } : {}),
    ...((STATUSES as readonly string[]).includes(sp.status ?? "") ? { status: sp.status as (typeof STATUSES)[number] } : {}),
  };
  const sort = SORTS[(sp.sort ?? "created") as keyof typeof SORTS] ?? SORTS.created;
  const [orgs, plans] = await Promise.all([
    db.organization.findMany({
      where, orderBy: sort as Prisma.OrganizationOrderByWithRelationInput, take: 500,
      include: {
        subscriptions: { orderBy: { createdAt: "desc" }, take: 1, include: { plan: true } },
        invoices: { where: { kind: "INVOICE", status: { in: ["OPEN", "PARTIALLY_PAID"] } }, select: { status: true, dueDate: true } },
        companies: { select: { id: true, _count: { select: { employees: { where: { status: { not: "TERMINATED" } } } } } } },
      },
    }),
    db.plan.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  const now = new Date();
  const list = orgs.filter((o) => !sp.plan || o.subscriptions[0]?.plan.code === sp.plan);
  const payment = (o: (typeof orgs)[number]) => (o.invoices.some((i) => isOverdue(i, now)) ? "OVERDUE" : o.invoices.length ? "OPEN" : "UP_TO_DATE");

  return (
    <div className="space-y-6">
      <PageHeader title={t("saas.customers.title")} description={t("saas.customers.subtitle", { count: list.length })} />
      <form className="flex flex-wrap items-end gap-3" data-testid="customer-filters">
        <Input name="q" defaultValue={q} placeholder={t("saas.customers.search")} className="w-64" aria-label={t("saas.customers.search")} />
        <Select name="status" defaultValue={sp.status ?? ""} className="w-48" aria-label={t("saas.customers.cols.status")}>
          <option value="">{t("saas.customers.allStatuses")}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{t(`saas.customerStatus.${s}`)}</option>)}
        </Select>
        <Select name="plan" defaultValue={sp.plan ?? ""} className="w-44" aria-label={t("saas.customers.cols.plan")}>
          <option value="">{t("saas.customers.allPlans")}</option>
          {plans.map((p) => <option key={p.code} value={p.code}>{p.nameNl}</option>)}
        </Select>
        <Select name="sort" defaultValue={sp.sort ?? "created"} className="w-44" aria-label={t("saas.customers.sort")}>
          {Object.keys(SORTS).map((s) => <option key={s} value={s}>{t(`saas.customers.sortBy.${s}`)}</option>)}
        </Select>
        <Button type="submit" variant="secondary">{t("common.show")}</Button>
      </form>
      <Card>
        {list.length === 0 ? <EmptyState title={t("saas.none")} /> : (
          <Table>
            <THead><TR>
              <TH>{t("saas.customers.cols.company")}</TH><TH>{t("saas.customers.cols.contact")}</TH><TH>{t("saas.customers.cols.created")}</TH><TH>{t("saas.customers.cols.plan")}</TH>
              <TH className="text-right">{t("saas.customers.cols.employees")}</TH><TH>{t("saas.customers.cols.status")}</TH><TH>{t("saas.customers.cols.subscription")}</TH>
              <TH>{t("saas.customers.cols.nextInvoice")}</TH><TH>{t("saas.customers.cols.payment")}</TH>
            </TR></THead>
            <TBody>
              {list.map((o) => {
                const sub = o.subscriptions[0];
                const pay = payment(o);
                return (
                  <TR key={o.id} data-testid={`customer-${o.id}`}>
                    <TD><Link href={`/admin/customers/${o.id}`} className="font-medium text-primary hover:underline">{o.name}</Link><span className="block text-xs text-muted-foreground">{o.registrationNumber ?? "—"} · {o.country}</span></TD>
                    <TD className="text-sm">{o.contactName ?? "—"}<span className="block text-xs text-muted-foreground">{o.contactEmail ?? "—"}{o.phone ? ` · ${o.phone}` : ""}</span></TD>
                    <TD className="tabular whitespace-nowrap text-xs">{f.date(o.createdAt)}</TD>
                    <TD className="text-sm">{sub?.plan.nameNl ?? "—"}</TD>
                    <TD className="tabular text-right">{o.companies.reduce((s, c) => s + c._count.employees, 0)}</TD>
                    <TD><CustomerBadge status={o.status} /></TD>
                    <TD>{sub ? <SubscriptionBadge status={sub.status} /> : <span className="text-xs text-muted-foreground">{t("saas.noSubscription")}</span>}</TD>
                    <TD className="tabular whitespace-nowrap text-xs">{sub?.nextInvoiceDate ? f.date(sub.nextInvoiceDate) : "—"}</TD>
                    <TD><Badge variant={pay === "OVERDUE" ? "destructive" : pay === "OPEN" ? "warning" : "success"}>{t(`saas.paymentStatus.${pay}`)}</Badge></TD>
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
