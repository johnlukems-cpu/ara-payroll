import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("audit.title") };
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const ctx = await requirePage("audit.view");
  const { t, f } = await getI18n();
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const take = 50;
  const logs = await db.auditLog.findMany({ where: { companyId: ctx.company.id }, include: { user: true }, orderBy: { createdAt: "desc" }, take: take + 1, skip: (page - 1) * take });
  return (
    <div>
      <PageHeader title={t("audit.title")} description={t("audit.subtitle")} />
      <Card>
        {logs.length === 0 ? <EmptyState title={t("audit.none")} /> : (
          <Table>
            <THead><TR><TH>{t("audit.cols.when")}</TH><TH>{t("audit.cols.user")}</TH><TH>{t("audit.cols.action")}</TH><TH>{t("audit.cols.record")}</TH><TH>{t("audit.cols.details")}</TH></TR></THead>
            <TBody>
              {logs.slice(0, take).map((l) => (
                <TR key={l.id}>
                  <TD className="tabular whitespace-nowrap">{f.dateTime(l.createdAt)}</TD>
                  <TD>{l.user?.name ?? t("audit.system")}</TD>
                  <TD><code className="rounded bg-muted px-1.5 py-0.5 text-xs">{l.action}</code></TD>
                  <TD className="text-muted-foreground">{l.entity}</TD>
                  <TD className="max-w-md truncate text-xs text-muted-foreground">{l.details ? JSON.stringify(l.details) : ""}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <div className="mt-4 flex justify-between text-sm">
        {page > 1 ? <a className="text-primary hover:underline" href={`?page=${page - 1}`}>{t("audit.newer")}</a> : <span />}
        {logs.length > take && <a className="text-primary hover:underline" href={`?page=${page + 1}`}>{t("audit.older")}</a>}
      </div>
    </div>
  );
}
