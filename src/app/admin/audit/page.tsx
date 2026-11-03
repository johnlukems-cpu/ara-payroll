import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/server/admin-page";
import { getI18n } from "@/lib/server/i18n";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("saas.nav.audit") };
}

/** Platform audit log: all administration actions (customers, subscriptions, invoices, payments, plans, roles) plus support access. */
export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdminPage();
  const { t, f } = await getI18n();
  const q = (await searchParams).q?.trim();
  const where: Prisma.AuditLogWhereInput = {
    AND: [
      { OR: [{ companyId: null }, { action: { startsWith: "support." } }] },
      ...(q ? [{ action: { contains: q, mode: "insensitive" as const } }] : []),
    ],
  };
  const logs = await db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 300, include: { user: { select: { name: true, email: true } }, company: { select: { name: true } } } });
  const orgIds = [...new Set(logs.filter((l) => l.entity === "Organization" && l.entityId).map((l) => l.entityId!))];
  const orgs = new Map((await db.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } })).map((o) => [o.id, o.name]));
  return (
    <div className="space-y-6">
      <PageHeader title={t("saas.audit.title")} description={t("saas.audit.subtitle")} />
      <form className="flex gap-2"><Input name="q" defaultValue={q} placeholder={t("saas.audit.search")} className="w-72" aria-label={t("saas.audit.search")} /><Button type="submit" variant="secondary">{t("common.show")}</Button></form>
      <Card>
        <Table data-testid="platform-audit">
          <THead><TR><TH>{t("saas.audit.when")}</TH><TH>{t("saas.audit.who")}</TH><TH>{t("saas.audit.action")}</TH><TH>{t("saas.audit.subject")}</TH><TH>{t("saas.audit.details")}</TH></TR></THead>
          <TBody>
            {logs.length === 0 && <TR><TD colSpan={5} className="text-sm text-muted-foreground">{t("saas.none")}</TD></TR>}
            {logs.map((l) => (
              <TR key={l.id}>
                <TD className="whitespace-nowrap text-xs">{f.dateTime(l.createdAt)}</TD>
                <TD className="text-xs">{l.user?.name ?? t("saas.system")}<span className="block text-muted-foreground">{l.user?.email}</span></TD>
                <TD className="font-mono text-xs">{l.action}</TD>
                <TD className="text-xs">{l.company?.name ?? (l.entityId && orgs.get(l.entityId)) ?? l.entity}</TD>
                <TD className="max-w-md truncate font-mono text-[11px] text-muted-foreground" title={l.details ? JSON.stringify(l.details) : ""}>{l.details ? JSON.stringify(l.details) : ""}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
