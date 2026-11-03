import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/server/admin-page";
import { getI18n } from "@/lib/server/i18n";
import { capacity, cyclePrice, isOverdue, trialDaysLeft } from "@/lib/saas";
import { assignPlanAction, startSupportAction, subscriptionAction, updateCustomerAction } from "@/app/actions/admin";
import { ActionForm } from "@/components/action-form";
import { ActionButton } from "@/components/confirm-button";
import { OpField, OpForm } from "@/components/admin-op-form";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CustomerBadge, InvoiceBadge, SubscriptionBadge } from "@/components/saas-badges";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("saas.customers.detail") };
}

const STATUSES = ["NEW_REQUEST", "IN_REVIEW", "ACTIVE", "TRIAL", "PAYMENT_DUE", "SUSPENDED", "CANCELLED"] as const;
const LIVE = ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED"];

/** Customer detail: organisation data, subscription (with all actions), companies, users, invoices, payments and activity. */
export default async function CustomerDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ approved?: string }> }) {
  const ctx = await requireAdminPage();
  const { t, f, locale } = await getI18n();
  const { id } = await params;
  const org = await db.organization.findUnique({
    where: { id },
    include: {
      companies: { orderBy: { createdAt: "asc" }, include: { _count: { select: { employees: { where: { status: { not: "TERMINATED" } } } } }, memberships: { include: { user: true }, orderBy: { createdAt: "asc" } } } },
      subscriptions: { orderBy: { createdAt: "desc" }, include: { plan: true, events: { orderBy: { createdAt: "desc" } } } },
      invoices: { orderBy: { issueDate: "desc" }, include: { payments: true } },
      payments: { orderBy: { paidAt: "desc" } },
      supportSessions: { orderBy: { startedAt: "desc" }, take: 20 },
    },
  });
  if (!org) notFound();
  const [plans, activity, methods, admins] = await Promise.all([
    db.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.auditLog.findMany({ where: { OR: [{ entityId: org.id }, { companyId: { in: org.companies.map((c) => c.id) }, action: { startsWith: "support." } }] }, orderBy: { createdAt: "desc" }, take: 50, include: { user: { select: { name: true } } } }),
    db.paymentMethod.findMany(),
    db.user.findMany({ where: { OR: [{ platformRole: { not: null } }, { isPlatformAdmin: true }] }, select: { id: true, name: true } }),
  ]);
  const now = new Date();
  const pn = (p: { nameNl: string; nameEn: string }) => (locale === "en" ? p.nameEn : p.nameNl);
  const who = (uid: string | null) => admins.find((a) => a.id === uid)?.name ?? (uid ? "—" : t("saas.system"));
  const methodName = (code: string) => { const m = methods.find((x) => x.code === code); return m ? (locale === "en" ? m.nameEn : m.nameNl) : code; };
  const sub = org.subscriptions[0] ?? null;
  const live = sub && LIVE.includes(sub.status) ? sub : null;
  const employees = org.companies.reduce((s, c) => s + c._count.employees, 0);
  const cap = capacity(sub);
  const users = new Map<string, { name: string; email: string; isActive: boolean; lastLoginAt: Date | null; roles: string[] }>();
  for (const c of org.companies) for (const m of c.memberships) {
    const u = users.get(m.userId) ?? { name: m.user.name, email: m.user.email, isActive: m.user.isActive, lastLoginAt: m.user.lastLoginAt, roles: [] };
    u.roles.push(`${t(`roles.${m.role}`)} · ${c.name}`);
    users.set(m.userId, u);
  }
  const money = (v: number | null | undefined, cur: string) => (v == null ? t("pricing.onRequest") : f.money(v, cur));
  const decimal = (v: number | null) => (v == null ? "" : (v / 100).toFixed(2));
  const sp = await searchParams;
  const trialOps = (trialSub: { id: string; billingCycle: string }) => (
    <>
                    <OpForm action={subscriptionAction} title={t("saas.sub.ops.convertTrial")} submit={t("saas.sub.ops.convertTrial")} hidden={{ id: trialSub.id, op: "convertTrial" }} testId="op-convertTrial" variant="default">
                      <OpField label={t("saas.sub.cycle")} wide><Select name="cycle" defaultValue={trialSub.billingCycle}><option value="MONTHLY">{t("saas.cycle.MONTHLY")}</option><option value="YEARLY">{t("saas.cycle.YEARLY")}</option></Select></OpField>
                    </OpForm>
                    <OpForm action={subscriptionAction} title={t("saas.sub.ops.extendTrial")} submit={t("saas.sub.ops.extendTrial")} hidden={{ id: trialSub.id, op: "extendTrial" }} testId="op-extendTrial">
                      <OpField label={t("saas.sub.days")} wide><Input name="days" type="number" min={1} max={365} defaultValue={14} /></OpField>
                    </OpForm>
                  </>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={org.name}
        description={<span className="flex flex-wrap items-center gap-2"><CustomerBadge status={org.status} />{sub && <SubscriptionBadge status={sub.status} />}<span>{t("saas.customers.since", { date: f.date(org.createdAt) })}</span></span>}
        actions={<Link href="/admin/customers" className="text-sm text-primary hover:underline">{t("saas.customers.back")}</Link>}
      />
      {sp.approved && <Alert variant="success">{t("saas.msg.request.approved")}</Alert>}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>{t("saas.customers.details")}</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={updateCustomerAction} className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="id" value={org.id} />
              <Field label={t("saas.customers.cols.company")}><Input name="name" defaultValue={org.name} required /></Field>
              <Field label={t("saas.customers.registrationNumber")}><Input name="registrationNumber" defaultValue={org.registrationNumber ?? ""} /></Field>
              <Field label={t("saas.customers.contactName")}><Input name="contactName" defaultValue={org.contactName ?? ""} /></Field>
              <Field label={t("saas.customers.contactEmail")}><Input name="contactEmail" type="email" defaultValue={org.contactEmail ?? ""} /></Field>
              <Field label={t("saas.customers.phone")}><Input name="phone" defaultValue={org.phone ?? ""} /></Field>
              <Field label={t("saas.customers.country")}><Input name="country" defaultValue={org.country} /></Field>
              <Field label={t("saas.customers.address")} className="sm:col-span-2"><Input name="address" defaultValue={org.address ?? ""} /></Field>
              <Field label={t("saas.customers.cols.status")} hint={t("saas.customers.statusHint")}>
                <Select name="status" defaultValue={org.status}>{STATUSES.map((s) => <option key={s} value={s}>{t(`saas.customerStatus.${s}`)}</option>)}</Select>
              </Field>
              <Field label={t("saas.customers.notes")} className="sm:col-span-2"><Textarea name="notes" rows={3} defaultValue={org.notes ?? ""} /></Field>
              <div className="sm:col-span-2"><SubmitButton>{t("common.save")}</SubmitButton></div>
            </ActionForm>
          </CardContent>
        </Card>

        <Card data-testid="subscription-panel">
          <CardHeader>
            <CardTitle>{t("saas.customers.subscription")}</CardTitle>
            {sub && <CardDescription>{pn(sub.plan)} · {t(`saas.cycle.${sub.billingCycle}`)}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!sub && <p className="text-muted-foreground">{t("saas.noSubscription")}</p>}
            {sub && (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5" data-testid="subscription-terms">
                <dt className="text-muted-foreground">{t("saas.sub.status")}</dt><dd><SubscriptionBadge status={sub.status} /></dd>
                <dt className="text-muted-foreground">{t("saas.sub.agreedPrice")}</dt><dd className="tabular">{money(cyclePrice(sub), sub.currency)}</dd>
                <dt className="text-muted-foreground">{t("saas.sub.discount")}</dt><dd className="tabular">{sub.discountBp ? `${sub.discountBp / 100}%` : "—"}</dd>
                <dt className="text-muted-foreground">{t("saas.sub.employees")}</dt><dd className="tabular" data-testid="capacity">{employees} / {cap ?? "∞"}</dd>
                <dt className="text-muted-foreground">{t("saas.plans.maxUsers")}</dt><dd className="tabular" data-testid="user-limit">{sub.maxUsers ?? "∞"}</dd>
                <dt className="text-muted-foreground">{t("saas.plans.storageLimitMb")}</dt><dd className="tabular">{sub.storageLimitMb != null ? `${sub.storageLimitMb} MB` : "∞"}</dd>
                {sub.supportLevel && <><dt className="text-muted-foreground">{t("saas.plans.supportLevel")}</dt><dd>{sub.supportLevel}</dd></>}
                <dt className="text-muted-foreground">{t("saas.sub.start")}</dt><dd className="tabular">{f.date(sub.startDate)}</dd>
                {sub.trialEnd && <><dt className="text-muted-foreground">{t("saas.sub.trialEnd")}</dt><dd className="tabular">{f.date(sub.trialEnd)}{sub.status === "TRIAL" && ` (${t("saas.daysLeft", { days: trialDaysLeft(sub.trialEnd, now) ?? 0 })})`}</dd></>}
                <dt className="text-muted-foreground">{t("saas.sub.nextInvoice")}</dt><dd className="tabular">{f.date(sub.nextInvoiceDate)}</dd>
                {sub.endDate && <><dt className="text-muted-foreground">{t("saas.sub.end")}</dt><dd className="tabular">{f.date(sub.endDate)}</dd></>}
                {sub.cancelReason && <><dt className="text-muted-foreground">{t("saas.sub.reason")}</dt><dd>{sub.cancelReason}</dd></>}
              </dl>
            )}

            {!live && (
              <OpForm action={assignPlanAction} title={t("saas.sub.assign")} submit={t("saas.sub.assign")} hidden={{ id: org.id }} testId="assign-plan" open={!sub}>
                <OpField label={t("saas.customers.cols.plan")}><Select name="plan">{plans.map((p) => <option key={p.code} value={p.code}>{pn(p)}</option>)}</Select></OpField>
                <OpField label={t("saas.sub.cycle")}><Select name="cycle"><option value="MONTHLY">{t("saas.cycle.MONTHLY")}</option><option value="YEARLY">{t("saas.cycle.YEARLY")}</option></Select></OpField>
                <label className="flex items-center gap-2 text-xs sm:col-span-2"><input type="checkbox" name="trial" defaultChecked /> {t("saas.sub.withTrial")}</label>
              </OpForm>
            )}

            {sub && !live && sub.status === "EXPIRED" && sub.trialStart && <div className="space-y-2" data-testid="subscription-actions">{trialOps(sub)}</div>}
            {live && (
              <div className="space-y-2" data-testid="subscription-actions">
                {live.status === "TRIAL" && trialOps(live)}
                <OpForm action={subscriptionAction} title={t("saas.sub.ops.changePlan")} submit={t("saas.sub.ops.changePlan")} hidden={{ id: live.id, op: "changePlan" }} testId="op-changePlan">
                  <OpField label={t("saas.customers.cols.plan")} wide><Select name="plan" defaultValue={live.plan.code}>{plans.map((p) => <option key={p.code} value={p.code}>{pn(p)} — {money(p.monthlyPrice, p.currency)}</option>)}</Select></OpField>
                  <p className="text-xs text-muted-foreground sm:col-span-2">{t("saas.sub.changePlanHint")}</p>
                </OpForm>
                {live.status !== "TRIAL" && (
                  <div className="flex flex-wrap gap-2">
                    <ActionButton action={subscriptionAction} fields={{ id: live.id, op: "renew" }} size="sm" variant="secondary" data-testid="op-renew">{t("saas.sub.ops.renew")}</ActionButton>
                    {live.status !== "SUSPENDED" && <ActionButton action={subscriptionAction} fields={{ id: live.id, op: "invoice" }} size="sm" variant="secondary" data-testid="op-invoice">{t("saas.sub.ops.invoice")}</ActionButton>}
                  </div>
                )}
                {live.status === "SUSPENDED"
                  ? <ActionButton action={subscriptionAction} fields={{ id: live.id, op: "resume" }} size="sm" data-testid="op-resume">{t("saas.sub.ops.resume")}</ActionButton>
                  : (
                    <OpForm action={subscriptionAction} title={t("saas.sub.ops.suspend")} submit={t("saas.sub.ops.suspend")} hidden={{ id: live.id, op: "suspend" }} testId="op-suspend" variant="destructive">
                      <OpField label={t("saas.sub.reason")} wide><Input name="reason" required /></OpField>
                    </OpForm>
                  )}
                <OpForm action={subscriptionAction} title={t("saas.sub.ops.capacity")} submit={t("common.save")} hidden={{ id: live.id, op: "capacity" }} testId="op-capacity">
                  <OpField label={t("saas.sub.extraEmployees")} wide><Input name="extra" type="number" min={0} defaultValue={live.extraEmployees} /></OpField>
                </OpForm>
                <OpForm action={subscriptionAction} title={t("saas.sub.ops.limits")} submit={t("common.save")} hidden={{ id: live.id, op: "limits" }} testId="op-limits">
                  <OpField label={t("saas.plans.maxUsers")}><Input name="maxUsers" type="number" min={1} defaultValue={live.maxUsers ?? ""} /></OpField>
                  <OpField label={t("saas.plans.storageLimitMb")}><Input name="storageLimitMb" type="number" min={1} defaultValue={live.storageLimitMb ?? ""} /></OpField>
                  <OpField label={t("saas.plans.supportLevel")} wide><Input name="supportLevel" defaultValue={live.supportLevel ?? ""} /></OpField>
                  <p className="text-xs text-muted-foreground sm:col-span-2">{t("saas.plans.maxHint")}</p>
                </OpForm>
                <OpForm action={subscriptionAction} title={t("saas.sub.ops.discount")} submit={t("common.save")} hidden={{ id: live.id, op: "discount" }} testId="op-discount">
                  <OpField label={t("saas.sub.discountPct")}><Input name="discount" inputMode="decimal" defaultValue={String(live.discountBp / 100)} /></OpField>
                  <OpField label={t("saas.sub.note")}><Input name="note" defaultValue={live.discountNote ?? ""} /></OpField>
                </OpForm>
                <OpForm action={subscriptionAction} title={t("saas.sub.ops.price")} submit={t("common.save")} hidden={{ id: live.id, op: "price" }} testId="op-price">
                  <OpField label={t("saas.plans.monthlyPrice")}><Input name="monthly" inputMode="decimal" defaultValue={decimal(live.priceMonthly)} /></OpField>
                  <OpField label={t("saas.plans.yearlyPrice")}><Input name="yearly" inputMode="decimal" defaultValue={decimal(live.priceYearly)} /></OpField>
                  <p className="text-xs text-muted-foreground sm:col-span-2">{t("saas.sub.priceHint")}</p>
                </OpForm>
                <OpForm action={subscriptionAction} title={t("saas.sub.ops.cancel")} submit={t("saas.sub.ops.cancel")} hidden={{ id: live.id, op: "cancel" }} testId="op-cancel" variant="destructive">
                  <OpField label={t("saas.sub.reason")}><Input name="reason" required /></OpField>
                  <OpField label={t("saas.sub.endDate")}><Input name="endDate" type="date" defaultValue={now.toISOString().slice(0, 10)} /></OpField>
                </OpForm>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t("saas.customers.companies")}</CardTitle></CardHeader>
          <Table>
            <THead><TR><TH>{t("saas.customers.cols.company")}</TH><TH>{t("saas.customers.currency")}</TH><TH className="text-right">{t("saas.customers.cols.employees")}</TH></TR></THead>
            <TBody>
              {org.companies.length === 0 && <TR><TD colSpan={3} className="text-sm text-muted-foreground">{t("saas.none")}</TD></TR>}
              {org.companies.map((c) => <TR key={c.id}><TD>{c.name}<span className="block text-xs text-muted-foreground">{c.kkfNumber ?? ""}</span></TD><TD>{c.currency}</TD><TD className="tabular text-right">{c._count.employees}</TD></TR>)}
            </TBody>
          </Table>
          {ctx.isSuper && org.companies.length > 0 && (
            <CardContent className="pt-4">
              <OpForm action={startSupportAction} title={t("saas.support.start")} submit={t("saas.support.start")} hidden={{}} testId="support-start">
                <OpField label={t("saas.customers.cols.company")}><Select name="companyId">{org.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></OpField>
                <OpField label={t("saas.support.hours")}><Input name="hours" type="number" min={1} max={8} defaultValue={1} /></OpField>
                <OpField label={t("saas.support.reason")} wide><Input name="reason" required minLength={10} /></OpField>
                <p className="text-xs text-muted-foreground sm:col-span-2">{t("saas.support.notice")}</p>
              </OpForm>
            </CardContent>
          )}
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("saas.customers.users")}</CardTitle></CardHeader>
          <Table>
            <THead><TR><TH>{t("saas.customers.contactName")}</TH><TH>{t("saas.customers.roles")}</TH><TH>{t("saas.customers.lastLogin")}</TH></TR></THead>
            <TBody>
              {users.size === 0 && <TR><TD colSpan={3} className="text-sm text-muted-foreground">{t("saas.none")}</TD></TR>}
              {[...users.values()].map((u) => (
                <TR key={u.email}>
                  <TD>{u.name}{!u.isActive && <Badge variant="muted" className="ml-2">{t("saas.users.inactive")}</Badge>}<span className="block text-xs text-muted-foreground">{u.email}</span></TD>
                  <TD className="text-xs">{u.roles.map((r) => <span key={r} className="block">{r}</span>)}</TD>
                  <TD className="whitespace-nowrap text-xs">{u.lastLoginAt ? f.dateTime(u.lastLoginAt) : "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{t("saas.customers.invoices")}</CardTitle><CardDescription><Link href={`/admin/billing?org=${org.id}`} className="text-primary hover:underline">{t("saas.nav.billing")}</Link></CardDescription></CardHeader>
        <Table>
          <THead><TR><TH>{t("saas.billing.number")}</TH><TH>{t("saas.billing.issueDate")}</TH><TH>{t("saas.billing.dueDate")}</TH><TH className="text-right">{t("saas.billing.total")}</TH><TH className="text-right">{t("saas.billing.paid")}</TH><TH>{t("saas.customers.cols.status")}</TH></TR></THead>
          <TBody>
            {org.invoices.length === 0 && <TR><TD colSpan={6} className="text-sm text-muted-foreground">{t("saas.none")}</TD></TR>}
            {org.invoices.map((i) => (
              <TR key={i.id} data-testid={`invoice-${i.number}`}>
                <TD><Link href={`/admin/billing/${i.id}`} className="font-medium text-primary hover:underline">{i.number}</Link>{i.kind === "CREDIT_NOTE" && <span className="block text-xs text-muted-foreground">{t("saas.billing.creditNote")}</span>}</TD>
                <TD className="tabular text-xs">{f.date(i.issueDate)}</TD>
                <TD className="tabular text-xs">{f.date(i.dueDate)}</TD>
                <TD className="tabular text-right">{f.money(i.total, i.currency)}</TD>
                <TD className="tabular text-right">{f.money(i.amountPaid, i.currency)}</TD>
                <TD><InvoiceBadge status={i.status} overdue={isOverdue(i, now)} /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t("saas.customers.payments")}</CardTitle></CardHeader>
          <Table>
            <THead><TR><TH>{t("saas.billing.paidAt")}</TH><TH>{t("saas.billing.method")}</TH><TH>{t("saas.billing.reference")}</TH><TH className="text-right">{t("saas.billing.amount")}</TH></TR></THead>
            <TBody>
              {org.payments.length === 0 && <TR><TD colSpan={4} className="text-sm text-muted-foreground">{t("saas.none")}</TD></TR>}
              {org.payments.map((p) => <TR key={p.id}><TD className="tabular text-xs">{f.date(p.paidAt)}</TD><TD className="text-xs">{methodName(p.methodCode)}</TD><TD className="text-xs">{p.reference ?? "—"}</TD><TD className="tabular text-right">{f.money(p.amount, p.currency)}</TD></TR>)}
            </TBody>
          </Table>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("saas.customers.history")}</CardTitle><CardDescription>{t("saas.customers.historyHint")}</CardDescription></CardHeader>
          <Table data-testid="subscription-history">
            <TBody>
              {org.subscriptions.flatMap((s) => s.events.map((e) => ({ e, s }))).length === 0 && <TR><TD className="text-sm text-muted-foreground">{t("saas.none")}</TD></TR>}
              {org.subscriptions.flatMap((s) => s.events.map((e) => (
                <TR key={e.id}>
                  <TD className="whitespace-nowrap text-xs">{f.dateTime(e.createdAt)}</TD>
                  <TD className="text-sm">{t(`saas.event.${e.type}` as never)}<span className="block text-xs text-muted-foreground">{pn(s.plan)} · {who(e.userId)}</span></TD>
                </TR>
              )))}
            </TBody>
          </Table>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{t("saas.customers.activity")}</CardTitle></CardHeader>
        <Table>
          <TBody>
            {activity.length === 0 && <TR><TD className="text-sm text-muted-foreground">{t("saas.none")}</TD></TR>}
            {activity.map((a) => (
              <TR key={a.id}>
                <TD className="whitespace-nowrap text-xs">{f.dateTime(a.createdAt)}</TD>
                <TD className="font-mono text-xs">{a.action}</TD>
                <TD className="text-xs">{a.user?.name ?? t("saas.system")}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {org.supportSessions.length > 0 && (
          <CardContent className="pt-4 text-xs text-muted-foreground">
            {t("saas.customers.supportSessions", { count: org.supportSessions.length })}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
