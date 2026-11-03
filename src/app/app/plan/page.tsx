import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { currentSubscription } from "@/lib/server/saas";
import { capacity, cyclePrice, isOverdue, trialDaysLeft } from "@/lib/saas";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { InvoiceBadge, SubscriptionBadge } from "@/components/saas-badges";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("saas.customerPlan.title") };
}

/** The customer's own subscription and invoices (owners and administrators only; scoped to the active company's organisation). */
export default async function CustomerPlanPage() {
  const ctx = await requirePage("company.manage");
  const { t, f, locale } = await getI18n();
  const orgId = ctx.company.organizationId;
  const [sub, invoices, employees] = await Promise.all([
    currentSubscription(orgId),
    db.invoice.findMany({ where: { organizationId: orgId }, orderBy: { issueDate: "desc" }, take: 100 }),
    db.employee.count({ where: { company: { organizationId: orgId }, status: { not: "TERMINATED" } } }),
  ]);
  const now = new Date();
  const price = sub ? cyclePrice(sub) : null;
  return (
    <div className="space-y-6">
      <PageHeader title={t("saas.customerPlan.title")} description={t("saas.customerPlan.subtitle")} />
      <Card data-testid="customer-plan">
        <CardHeader>
          <CardTitle>{sub ? (locale === "en" ? sub.plan.nameEn : sub.plan.nameNl) : t("saas.noSubscription")}</CardTitle>
          {sub && <CardDescription className="flex items-center gap-2"><SubscriptionBadge status={sub.status} /> {t(`saas.cycle.${sub.billingCycle}`)}</CardDescription>}
        </CardHeader>
        {sub && (
          <CardContent>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div><dt className="text-muted-foreground">{t("saas.sub.agreedPrice")}</dt><dd className="tabular font-medium">{price == null ? t("pricing.onRequest") : f.money(price, sub.currency)}{sub.discountBp ? ` (−${sub.discountBp / 100}%)` : ""}</dd></div>
              <div><dt className="text-muted-foreground">{t("saas.sub.employees")}</dt><dd className="tabular font-medium">{employees} / {capacity(sub) ?? "∞"}</dd></div>
              <div><dt className="text-muted-foreground">{t("saas.plans.maxUsers")}</dt><dd className="tabular font-medium">{sub.maxUsers ?? "∞"}</dd></div>
              <div><dt className="text-muted-foreground">{t("saas.plans.storageLimitMb")}</dt><dd className="tabular font-medium">{sub.storageLimitMb != null ? `${sub.storageLimitMb} MB` : "∞"}</dd></div>
              {sub.supportLevel && <div><dt className="text-muted-foreground">{t("saas.plans.supportLevel")}</dt><dd className="font-medium">{sub.supportLevel}</dd></div>}
              <div><dt className="text-muted-foreground">{t("saas.sub.start")}</dt><dd className="tabular">{f.date(sub.startDate)}</dd></div>
              {sub.status === "TRIAL" && <div><dt className="text-muted-foreground">{t("saas.sub.trialEnd")}</dt><dd className="tabular">{f.date(sub.trialEnd)} ({t("saas.daysLeft", { days: trialDaysLeft(sub.trialEnd, now) ?? 0 })})</dd></div>}
              {sub.nextInvoiceDate && <div><dt className="text-muted-foreground">{t("saas.sub.nextInvoice")}</dt><dd className="tabular">{f.date(sub.nextInvoiceDate)}</dd></div>}
              {sub.endDate && <div><dt className="text-muted-foreground">{t("saas.sub.end")}</dt><dd className="tabular">{f.date(sub.endDate)}</dd></div>}
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">{t("saas.customerPlan.changeNote")}</p>
          </CardContent>
        )}
      </Card>
      <Card>
        <CardHeader><CardTitle>{t("saas.customers.invoices")}</CardTitle></CardHeader>
        <Table>
          <THead><TR><TH>{t("saas.billing.number")}</TH><TH>{t("saas.billing.issueDate")}</TH><TH>{t("saas.billing.dueDate")}</TH><TH className="text-right">{t("saas.billing.total")}</TH><TH>{t("saas.customers.cols.status")}</TH><TH /></TR></THead>
          <TBody>
            {invoices.length === 0 && <TR><TD colSpan={6} className="text-sm text-muted-foreground">{t("saas.none")}</TD></TR>}
            {invoices.map((i) => (
              <TR key={i.id}>
                <TD className="font-medium">{i.number}{i.kind === "CREDIT_NOTE" && <span className="block text-xs text-muted-foreground">{t("saas.billing.creditNote")}</span>}</TD>
                <TD className="tabular text-xs">{f.date(i.issueDate)}</TD>
                <TD className="tabular text-xs">{i.kind === "INVOICE" ? f.date(i.dueDate) : "—"}</TD>
                <TD className="tabular text-right">{f.money(i.total, i.currency)}</TD>
                <TD><InvoiceBadge status={i.status} overdue={isOverdue(i, now)} /></TD>
                <TD><a href={`/api/invoices/${i.id}/pdf`} className="text-sm text-primary hover:underline">{t("saas.billing.pdf")}</a></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
