import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/server/admin-page";
import { getI18n } from "@/lib/server/i18n";
import { isOverdue } from "@/lib/saas";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { InvoiceBadge } from "@/components/saas-badges";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("saas.nav.billing") };
}

const STATUSES = ["OPEN", "PARTIALLY_PAID", "PAID", "CREDITED", "VOID"] as const;

/** Invoices and credit notes of all customers, with outstanding amounts and payment status. */
export default async function BillingPage({ searchParams }: { searchParams: Promise<{ status?: string; org?: string; q?: string; overdue?: string }> }) {
  await requireAdminPage();
  const { t, f } = await getI18n();
  const sp = await searchParams;
  const q = sp.q?.trim();
  const where: Prisma.InvoiceWhereInput = {
    ...((STATUSES as readonly string[]).includes(sp.status ?? "") ? { status: sp.status as (typeof STATUSES)[number] } : {}),
    ...(sp.org ? { organizationId: sp.org } : {}),
    ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { organization: { name: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const now = new Date();
  const [all, methods] = await Promise.all([
    db.invoice.findMany({ where, orderBy: [{ issueDate: "desc" }, { number: "desc" }], take: 500, include: { organization: { select: { id: true, name: true } } } }),
    db.paymentMethod.findMany({ where: { isActive: true } }),
  ]);
  const invoices = sp.overdue ? all.filter((i) => isOverdue(i, now)) : all;
  const sum = (list: typeof all, fn: (i: (typeof all)[number]) => number) => {
    const m: Record<string, number> = {};
    for (const i of list) m[i.currency] = (m[i.currency] ?? 0) + fn(i);
    return Object.keys(m).length ? Object.entries(m).map(([c, v]) => f.money(v, c)).join(" · ") : f.money(0, "SRD");
  };
  const open = all.filter((i) => i.kind === "INVOICE" && (i.status === "OPEN" || i.status === "PARTIALLY_PAID"));

  return (
    <div className="space-y-6">
      <PageHeader title={t("saas.billing.title")} description={t("saas.billing.subtitle")} />
      <div className="grid gap-4 sm:grid-cols-3" data-testid="billing-stats">
        <Stat label={t("saas.billing.outstanding")} value={sum(open, (i) => i.total - i.amountPaid)} sub={t("saas.billing.openCount", { count: open.length })} />
        <Stat label={t("saas.billing.overdue")} value={sum(open.filter((i) => isOverdue(i, now)), (i) => i.total - i.amountPaid)} />
        <Stat label={t("saas.billing.methods")} value={methods.length} sub={methods.map((m) => m.nameNl).join(", ") || "—"} />
      </div>
      <p className="text-xs text-muted-foreground">{t("saas.billing.manualNote")}</p>
      <form className="flex flex-wrap items-end gap-3">
        {sp.org && <input type="hidden" name="org" value={sp.org} />}
        <Input name="q" defaultValue={q} placeholder={t("saas.billing.search")} className="w-64" aria-label={t("saas.billing.search")} />
        <Select name="status" defaultValue={sp.status ?? ""} className="w-48" aria-label={t("saas.customers.cols.status")}>
          <option value="">{t("saas.customers.allStatuses")}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{t(`saas.invoiceStatus.${s}`)}</option>)}
        </Select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="overdue" value="1" defaultChecked={!!sp.overdue} /> {t("saas.billing.onlyOverdue")}</label>
        <Button type="submit" variant="secondary">{t("common.show")}</Button>
      </form>
      <Card>
        {invoices.length === 0 ? <EmptyState title={t("saas.none")} description={t("saas.billing.emptyHint")} /> : (
          <Table>
            <THead><TR>
              <TH>{t("saas.billing.number")}</TH><TH>{t("saas.customers.cols.company")}</TH><TH>{t("saas.billing.issueDate")}</TH><TH>{t("saas.billing.dueDate")}</TH>
              <TH className="text-right">{t("saas.billing.total")}</TH><TH className="text-right">{t("saas.billing.outstanding")}</TH><TH>{t("saas.customers.cols.status")}</TH>
            </TR></THead>
            <TBody>
              {invoices.map((i) => (
                <TR key={i.id} data-testid={`invoice-row-${i.number}`}>
                  <TD><Link href={`/admin/billing/${i.id}`} className="font-medium text-primary hover:underline">{i.number}</Link>{i.kind === "CREDIT_NOTE" && <span className="block text-xs text-muted-foreground">{t("saas.billing.creditNote")}</span>}</TD>
                  <TD><Link href={`/admin/customers/${i.organization.id}`} className="hover:underline">{i.organization.name}</Link></TD>
                  <TD className="tabular text-xs">{f.date(i.issueDate)}</TD>
                  <TD className="tabular text-xs">{i.kind === "INVOICE" ? f.date(i.dueDate) : "—"}</TD>
                  <TD className="tabular text-right">{f.money(i.total, i.currency)}</TD>
                  <TD className="tabular text-right">{i.kind === "INVOICE" && i.status !== "CREDITED" && i.status !== "VOID" ? f.money(i.total - i.amountPaid, i.currency) : "—"}</TD>
                  <TD><InvoiceBadge status={i.status} overdue={isOverdue(i, now)} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
