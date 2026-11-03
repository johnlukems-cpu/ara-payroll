import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/server/admin-page";
import { getI18n } from "@/lib/server/i18n";
import { endSupportAction, startSupportAction } from "@/app/actions/admin";
import { ActionButton } from "@/components/confirm-button";
import { OpField, OpForm } from "@/components/admin-op-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { Alert, PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("saas.nav.support") };
}

/**
 * Controlled support access. Only super administrators can open a customer environment: with a stated reason,
 * for at most 8 hours, read-only, and logged both here and in the customer's own audit log. No impersonation.
 */
export default async function SupportPage() {
  const ctx = await requireAdminPage();
  const { t, f } = await getI18n();
  const now = new Date();
  const [sessions, companies, admins] = await Promise.all([
    db.supportAccess.findMany({ orderBy: { startedAt: "desc" }, take: 100, include: { organization: { select: { id: true, name: true } } } }),
    ctx.isSuper ? db.company.findMany({ orderBy: [{ organization: { name: "asc" } }, { name: "asc" }], select: { id: true, name: true, organization: { select: { name: true } } } }) : [],
    db.user.findMany({ where: { OR: [{ platformRole: { not: null } }, { isPlatformAdmin: true }] }, select: { id: true, name: true } }),
  ]);
  const companyName = new Map((await db.company.findMany({ where: { id: { in: sessions.map((s) => s.companyId) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  const active = (s: (typeof sessions)[number]) => !s.endedAt && s.expiresAt > now;

  return (
    <div className="space-y-6">
      <PageHeader title={t("saas.support.title")} description={t("saas.support.subtitle")} />
      <Alert variant="info">{t("saas.support.notice")}</Alert>
      {ctx.isSuper ? (
        <Card>
          <CardHeader><CardTitle>{t("saas.support.start")}</CardTitle><CardDescription>{t("saas.support.startHint")}</CardDescription></CardHeader>
          <CardContent>
            <OpForm action={startSupportAction} title={t("saas.support.start")} submit={t("saas.support.start")} hidden={{}} testId="support-start" open>
              <OpField label={t("saas.customers.cols.company")} wide>
                <Select name="companyId">{companies.map((c) => <option key={c.id} value={c.id}>{c.organization.name} — {c.name}</option>)}</Select>
              </OpField>
              <OpField label={t("saas.support.reason")}><Input name="reason" required minLength={10} /></OpField>
              <OpField label={t("saas.support.hours")}><Input name="hours" type="number" min={1} max={8} defaultValue={1} /></OpField>
            </OpForm>
          </CardContent>
        </Card>
      ) : <Alert variant="warning">{t("saas.support.superOnly")}</Alert>}
      <Card>
        <CardHeader><CardTitle>{t("saas.support.sessions")}</CardTitle></CardHeader>
        <Table data-testid="support-sessions">
          <THead><TR><TH>{t("saas.customers.cols.company")}</TH><TH>{t("saas.support.admin")}</TH><TH>{t("saas.support.reason")}</TH><TH>{t("saas.support.startedAt")}</TH><TH>{t("saas.support.until")}</TH><TH>{t("saas.customers.cols.status")}</TH><TH /></TR></THead>
          <TBody>
            {sessions.length === 0 && <TR><TD colSpan={7} className="text-sm text-muted-foreground">{t("saas.none")}</TD></TR>}
            {sessions.map((s) => (
              <TR key={s.id}>
                <TD><Link href={`/admin/customers/${s.organization.id}`} className="hover:underline">{s.organization.name}</Link><span className="block text-xs text-muted-foreground">{companyName.get(s.companyId) ?? "—"}</span></TD>
                <TD className="text-sm">{admins.find((a) => a.id === s.adminUserId)?.name ?? "—"}</TD>
                <TD className="max-w-xs text-sm">{s.reason}</TD>
                <TD className="whitespace-nowrap text-xs">{f.dateTime(s.startedAt)}</TD>
                <TD className="whitespace-nowrap text-xs">{f.dateTime(s.endedAt ?? s.expiresAt)}</TD>
                <TD><Badge variant={active(s) ? "warning" : "muted"}>{t(active(s) ? "saas.support.active" : s.endedAt ? "saas.support.ended" : "saas.support.expired")}</Badge></TD>
                <TD>{active(s) && ctx.isSuper && s.adminUserId === ctx.user.id && <ActionButton action={endSupportAction} fields={{ id: s.id }} size="sm" variant="secondary">{t("saas.support.end")}</ActionButton>}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
