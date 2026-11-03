import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/server/admin-page";
import { getI18n } from "@/lib/server/i18n";
import { getCurrencies } from "@/lib/server/rates";
import { requestAction } from "@/app/actions/admin";
import { ActionButton } from "@/components/confirm-button";
import { OpField, OpForm } from "@/components/admin-op-form";
import { CurrencySelect } from "@/components/currency-select";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { RequestBadge } from "@/components/saas-badges";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("saas.nav.requests") };
}

const STATUSES = ["NEW", "IN_REVIEW", "INFO_REQUESTED", "DEMO_SCHEDULED", "APPROVED", "REJECTED", "CONVERTED"] as const;
const TYPES = ["REGISTRATION", "DEMO", "QUOTE"] as const;
const OPEN = ["NEW", "IN_REVIEW", "INFO_REQUESTED", "DEMO_SCHEDULED"] as const;

/** New requests from the registration, demo, quote and contact forms, with the full approval workflow. */
export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ status?: string; type?: string; q?: string }> }) {
  await requireAdminPage();
  const { t, f, locale } = await getI18n();
  const sp = await searchParams;
  const status = sp.status ?? "open";
  const q = sp.q?.trim();
  const where: Prisma.ContactRequestWhereInput = {
    ...(status === "open" ? { status: { in: [...OPEN] } } : (STATUSES as readonly string[]).includes(status) ? { status: status as (typeof STATUSES)[number] } : {}),
    ...((TYPES as readonly string[]).includes(sp.type ?? "") ? { type: sp.type as (typeof TYPES)[number] } : {}),
    ...(q ? { OR: ["name", "company", "email", "organizationName"].map((k) => ({ [k]: { contains: q, mode: "insensitive" } })) } : {}),
  };
  const [requests, plans, currencies] = await Promise.all([
    db.contactRequest.findMany({ where, orderBy: { createdAt: "desc" }, take: 300 }),
    db.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    getCurrencies(),
  ]);
  const types = await db.contactRequest.findMany({ select: { type: true }, distinct: ["type"] });
  const pn = (code: string | null) => { const p = plans.find((x) => x.code === code); return p ? (locale === "en" ? p.nameEn : p.nameNl) : code ?? "—"; };

  return (
    <div className="space-y-6">
      <PageHeader title={t("saas.requests.title")} description={t("saas.requests.subtitle")} />
      <form className="flex flex-wrap items-end gap-3" data-testid="request-filters">
        <Input name="q" defaultValue={q} placeholder={t("saas.customers.search")} className="w-64" aria-label={t("saas.customers.search")} />
        <Select name="status" defaultValue={status} className="w-52" aria-label={t("saas.customers.cols.status")}>
          <option value="open">{t("saas.requests.open")}</option>
          <option value="all">{t("saas.customers.allStatuses")}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{t(`saas.requestStatus.${s}`)}</option>)}
        </Select>
        <Select name="type" defaultValue={sp.type ?? ""} className="w-48" aria-label={t("saas.requests.type")}>
          <option value="">{t("saas.requests.allTypes")}</option>
          {types.map(({ type }) => <option key={type} value={type}>{t(`saas.requestType.${type}`)}</option>)}
        </Select>
        <Button type="submit" variant="secondary">{t("common.show")}</Button>
      </form>

      {requests.length === 0 ? <Card><EmptyState title={t("saas.none")} /></Card> : (
        <div className="space-y-4">
          {requests.map((r) => {
            const open = (OPEN as readonly string[]).includes(r.status);
            return (
              <Card key={r.id} className="p-5" data-testid={`request-${r.email}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{r.organizationName ?? r.company}{r.organizationName && r.organizationName !== r.company && <span className="font-normal text-muted-foreground"> · {r.company}</span>}</p>
                    <p className="text-sm text-muted-foreground">{r.name} · <a href={`mailto:${r.email}`} className="hover:underline">{r.email}</a>{r.phone ? ` · ${r.phone}` : ""}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("saas.requests.received", { date: f.dateTime(r.createdAt) })} · {t("saas.customers.cols.plan")}: {pn(r.plan)}
                      {r.employees != null && ` · ${t("saas.requests.employees", { count: r.employees })}`}{r.currency && ` · ${r.currency}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="muted">{t(`saas.requestType.${r.type}`)}</Badge>
                    <RequestBadge status={r.status} />
                  </div>
                </div>
                {r.message && <p className="mt-3 whitespace-pre-line rounded-lg bg-muted/40 p-3 text-sm">{r.message}</p>}
                {r.demoAt && <p className="mt-2 text-sm">{t("saas.requests.demoAt", { date: f.dateTime(r.demoAt) })}</p>}
                {r.adminNote && <p className="mt-2 text-sm text-muted-foreground">{t("saas.requests.note")}: {r.adminNote}</p>}
                {r.organizationId && <p className="mt-2 text-sm"><Link href={`/admin/customers/${r.organizationId}`} className="text-primary hover:underline">{t("saas.requests.toCustomer")}</Link></p>}

                {open && (
                  <div className="mt-4 space-y-2" data-testid="request-actions">
                    <div className="flex flex-wrap gap-2">
                      {r.type === "REGISTRATION"
                        ? <ActionButton action={requestAction} fields={{ id: r.id, op: "approve" }} size="sm" confirm={t("saas.requests.approveConfirm")} data-testid="request-approve">{t("saas.requests.ops.approve")}</ActionButton>
                        : <ActionButton action={requestAction} fields={{ id: r.id, op: "approve" }} size="sm" variant="secondary">{t("saas.requests.ops.markHandled")}</ActionButton>}
                      {r.status === "NEW" && <ActionButton action={requestAction} fields={{ id: r.id, op: "review" }} size="sm" variant="secondary">{t("saas.requests.ops.review")}</ActionButton>}
                    </div>
                    {r.type === "REGISTRATION" && <p className="text-xs text-muted-foreground">{t("saas.requests.approveHint")}</p>}
                    <div className="grid gap-2 lg:grid-cols-2">
                      <OpForm action={requestAction} title={t("saas.requests.ops.info")} submit={t("saas.requests.ops.info")} hidden={{ id: r.id, op: "info" }}>
                        <OpField label={t("saas.requests.note")} wide><Input name="note" required /></OpField>
                      </OpForm>
                      <OpForm action={requestAction} title={t("saas.requests.ops.demo")} submit={t("saas.requests.ops.demo")} hidden={{ id: r.id, op: "demo" }}>
                        <OpField label={t("saas.requests.demoMoment")}><Input name="demoAt" type="datetime-local" required /></OpField>
                        <OpField label={t("saas.requests.note")}><Input name="note" /></OpField>
                      </OpForm>
                      {r.type !== "REGISTRATION" && (
                        <OpForm action={requestAction} title={t("saas.requests.ops.convert")} submit={t("saas.requests.ops.convert")} hidden={{ id: r.id, op: "convert" }} testId="request-convert">
                          <OpField label={t("saas.requests.organizationName")}><Input name="organizationName" defaultValue={r.organizationName ?? r.company} required /></OpField>
                          <OpField label={t("saas.requests.companyName")}><Input name="companyName" defaultValue={r.company} required /></OpField>
                          <OpField label={t("saas.customers.currency")}><CurrencySelect name="currency" currencies={currencies} defaultValue="SRD" /></OpField>
                          <OpField label={t("saas.customers.cols.plan")}><Select name="plan" defaultValue={r.plan ?? "starter"}>{plans.map((p) => <option key={p.code} value={p.code}>{locale === "en" ? p.nameEn : p.nameNl}</option>)}</Select></OpField>
                          <label className="flex items-center gap-2 text-xs sm:col-span-2"><input type="checkbox" name="trial" defaultChecked /> {t("saas.sub.withTrial")}</label>
                          <p className="text-xs text-muted-foreground sm:col-span-2">{t("saas.requests.convertHint")}</p>
                        </OpForm>
                      )}
                      <OpForm action={requestAction} title={t("saas.requests.ops.reject")} submit={t("saas.requests.ops.reject")} hidden={{ id: r.id, op: "reject" }} variant="destructive" testId="request-reject">
                        <OpField label={t("saas.requests.reason")} wide><Input name="note" required /></OpField>
                      </OpForm>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
