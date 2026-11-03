import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/server/admin-page";
import { getI18n } from "@/lib/server/i18n";
import { isOverdue } from "@/lib/saas";
import { creditInvoiceAction, recordPaymentAction } from "@/app/actions/admin";
import { OpField, OpForm } from "@/components/admin-op-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { buttonVariants } from "@/components/ui/button";
import { Alert, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { InvoiceBadge } from "@/components/saas-badges";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("saas.billing.invoice") };
}

type Line = { description?: string; quantity?: number; unitPrice?: number; amount?: number };

/** Invoice detail: lines, totals, payments, credit notes; record a (manual) payment or issue a credit note. */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { t, f, locale } = await getI18n();
  const { id } = await params;
  const inv = await db.invoice.findUnique({ where: { id }, include: { organization: true, payments: { orderBy: { paidAt: "asc" } }, subscription: { include: { plan: true } } } });
  if (!inv) notFound();
  const [credits, original, methods] = await Promise.all([
    db.invoice.findMany({ where: { creditForId: inv.id }, orderBy: { issueDate: "asc" } }),
    inv.creditForId ? db.invoice.findUnique({ where: { id: inv.creditForId } }) : null,
    db.paymentMethod.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
  ]);
  const now = new Date();
  const credited = -credits.reduce((s, c) => s + c.total, 0);
  const outstanding = Math.max(0, inv.total - inv.amountPaid - credited);
  const payable = inv.kind === "INVOICE" && (inv.status === "OPEN" || inv.status === "PARTIALLY_PAID");
  const lines = (Array.isArray(inv.lines) ? inv.lines : []) as Line[];
  const m = (v: number) => f.money(v, inv.currency);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${t(inv.kind === "CREDIT_NOTE" ? "saas.billing.creditNote" : "saas.billing.invoice")} ${inv.number}`}
        description={<span className="flex flex-wrap items-center gap-2"><InvoiceBadge status={inv.status} overdue={isOverdue(inv, now)} /><Link href={`/admin/customers/${inv.organizationId}`} className="text-primary hover:underline">{inv.organization.name}</Link></span>}
        actions={<a href={`/api/invoices/${inv.id}/pdf`} className={buttonVariants({ variant: "outline" })} data-testid="invoice-pdf"><Download className="h-4 w-4" /> {t("saas.billing.pdf")}</a>}
      />
      {original && <Alert variant="info">{t("saas.billing.creditFor")} <Link href={`/admin/billing/${original.id}`} className="font-medium underline">{original.number}</Link></Alert>}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>{t("saas.billing.lines")}</CardTitle></CardHeader>
          <Table>
            <THead><TR><TH>{t("saas.billing.description")}</TH><TH className="text-right">{t("saas.billing.quantity")}</TH><TH className="text-right">{t("saas.billing.unitPrice")}</TH><TH className="text-right">{t("saas.billing.amount")}</TH></TR></THead>
            <TBody>
              {lines.map((l, i) => <TR key={i}><TD className="text-sm">{l.description}</TD><TD className="tabular text-right">{l.quantity ?? 1}</TD><TD className="tabular text-right">{m(l.unitPrice ?? 0)}</TD><TD className="tabular text-right">{m(l.amount ?? 0)}</TD></TR>)}
              <TR><TD colSpan={3} className="text-right text-sm">{t("saas.billing.subtotal")}</TD><TD className="tabular text-right">{m(inv.subtotal)}</TD></TR>
              {inv.discount > 0 && <TR><TD colSpan={3} className="text-right text-sm">{t("saas.billing.discount")}</TD><TD className="tabular text-right">{m(-inv.discount)}</TD></TR>}
              <TR><TD colSpan={3} className="text-right font-semibold">{t("saas.billing.total")}</TD><TD className="tabular text-right font-semibold" data-testid="invoice-total">{m(inv.total)}</TD></TR>
              {inv.kind === "INVOICE" && <>
                <TR><TD colSpan={3} className="text-right text-sm">{t("saas.billing.paid")}</TD><TD className="tabular text-right">{m(inv.amountPaid)}</TD></TR>
                {credited > 0 && <TR><TD colSpan={3} className="text-right text-sm">{t("saas.billing.credited")}</TD><TD className="tabular text-right">{m(credited)}</TD></TR>}
                <TR><TD colSpan={3} className="text-right font-semibold">{t("saas.billing.outstanding")}</TD><TD className="tabular text-right font-semibold" data-testid="invoice-outstanding">{m(outstanding)}</TD></TR>
              </>}
            </TBody>
          </Table>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("saas.billing.data")}</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">{t("saas.billing.issueDate")}</dt><dd className="tabular">{f.date(inv.issueDate)}</dd>
              {inv.kind === "INVOICE" && <><dt className="text-muted-foreground">{t("saas.billing.dueDate")}</dt><dd className="tabular">{f.date(inv.dueDate)}</dd></>}
              {inv.periodStart && <><dt className="text-muted-foreground">{t("saas.billing.period")}</dt><dd className="tabular">{f.date(inv.periodStart)} – {f.date(inv.periodEnd)}</dd></>}
              <dt className="text-muted-foreground">{t("saas.customers.currency")}</dt><dd>{inv.currency}</dd>
              {inv.subscription && <><dt className="text-muted-foreground">{t("saas.customers.cols.plan")}</dt><dd>{locale === "en" ? inv.subscription.plan.nameEn : inv.subscription.plan.nameNl}</dd></>}
              {inv.notes && <><dt className="text-muted-foreground">{t("saas.billing.notes")}</dt><dd>{inv.notes}</dd></>}
            </dl>
          </CardContent>
        </Card>
      </div>

      {payable && (
        <div className="grid gap-4 lg:grid-cols-2">
          <OpForm action={recordPaymentAction} title={t("saas.billing.recordPayment")} submit={t("saas.billing.recordPayment")} hidden={{ id: inv.id }} testId="record-payment" variant="default" open>
            <OpField label={t("saas.billing.amount")}><Input name="amount" inputMode="decimal" defaultValue={(outstanding / 100).toFixed(2)} required /></OpField>
            <OpField label={t("saas.billing.paidAt")}><Input name="paidAt" type="date" defaultValue={now.toISOString().slice(0, 10)} max={now.toISOString().slice(0, 10)} required /></OpField>
            <OpField label={t("saas.billing.method")}><Select name="method">{methods.map((pm) => <option key={pm.code} value={pm.code}>{locale === "en" ? pm.nameEn : pm.nameNl}</option>)}</Select></OpField>
            <OpField label={t("saas.billing.reference")}><Input name="reference" /></OpField>
            <OpField label={t("saas.billing.notes")} wide><Input name="note" /></OpField>
            <p className="text-xs text-muted-foreground sm:col-span-2">{t("saas.billing.recordHint")}</p>
          </OpForm>
          <OpForm action={creditInvoiceAction} title={t("saas.billing.credit")} submit={t("saas.billing.credit")} hidden={{ id: inv.id }} testId="credit-invoice" variant="destructive">
            <OpField label={t("saas.billing.creditAmount")}><Input name="amount" inputMode="decimal" placeholder={(outstanding / 100).toFixed(2)} /></OpField>
            <OpField label={t("saas.sub.reason")}><Input name="reason" required /></OpField>
            <p className="text-xs text-muted-foreground sm:col-span-2">{t("saas.billing.creditHint")}</p>
          </OpForm>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t("saas.billing.paymentHistory")}</CardTitle></CardHeader>
          <Table data-testid="payment-history">
            <TBody>
              {inv.payments.length === 0 && <TR><TD className="text-sm text-muted-foreground">{t("saas.none")}</TD></TR>}
              {inv.payments.map((p) => <TR key={p.id}><TD className="tabular text-xs">{f.date(p.paidAt)}</TD><TD className="text-xs">{p.methodCode}{p.reference ? ` · ${p.reference}` : ""}</TD><TD className="tabular text-right">{f.money(p.amount, p.currency)}</TD></TR>)}
            </TBody>
          </Table>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("saas.billing.creditNotes")}</CardTitle></CardHeader>
          <Table>
            <TBody>
              {credits.length === 0 && <TR><TD className="text-sm text-muted-foreground">{t("saas.none")}</TD></TR>}
              {credits.map((c) => <TR key={c.id}><TD><Link href={`/admin/billing/${c.id}`} className="text-primary hover:underline">{c.number}</Link></TD><TD className="tabular text-xs">{f.date(c.issueDate)}</TD><TD className="tabular text-right">{f.money(c.total, c.currency)}</TD></TR>)}
            </TBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
