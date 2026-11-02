import Link from "next/link";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DeclarationStatusBadge } from "../status-badge";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("tax.tabs.history") };
}

export default async function HistoryPage() {
  const ctx = await requirePage("tax.view");
  const { t, f } = await getI18n();
  const [declarations, events] = await Promise.all([
    db.declaration.findMany({ where: { companyId: ctx.company.id }, orderBy: [{ year: "desc" }, { month: "desc" }, { version: "desc" }], include: { _count: { select: { files: true } } } }),
    db.declarationEvent.findMany({ where: { declaration: { companyId: ctx.company.id } }, orderBy: { createdAt: "desc" }, take: 50, include: { declaration: { select: { id: true, year: true, month: true, version: true, type: true } } } }),
  ]);
  const users = new Map((await db.user.findMany({ where: { id: { in: [...new Set(events.map((e) => e.userId).filter(Boolean) as string[])] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const label = (d: { year: number; month: number; type: string; version: number }) => `${t(`decl.type.${d.type}` as never)} ${d.month ? f.period(d.year, d.month) : d.year}${d.version > 1 ? ` (v${d.version})` : ""}`;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>{t("tax.historyTitle")}</CardTitle></CardHeader>
        {declarations.length === 0 ? <EmptyState title={t("tax.noDeclarations")} /> : (
          <Table>
            <THead><TR><TH>{t("tax.cols.declaration")}</TH><TH>{t("tax.cols.status")}</TH><TH className="text-right">{t("tax.cols.payable")}</TH><TH>{t("tax.cols.files")}</TH><TH>{t("tax.cols.submission")}</TH><TH>{t("tax.cols.payment")}</TH></TR></THead>
            <TBody>
              {declarations.map((d) => (
                <TR key={d.id}>
                  <TD><Link className="font-medium text-primary hover:underline" href={`/app/tax/declarations/${d.id}`}>{label(d)}</Link></TD>
                  <TD><DeclarationStatusBadge status={d.status} /></TD>
                  <TD className="tabular text-right">{f.money(d.totalPayable, d.currency)}</TD>
                  <TD>{d._count.files}</TD>
                  <TD className="text-xs">{d.submittedAt ? `${f.date(d.submittedAt)} · ${d.submissionReference}` : "—"}</TD>
                  <TD className="text-xs">{d.paidAt ? f.date(d.paidAt) : "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader><CardTitle>{t("tax.recentEvents")}</CardTitle></CardHeader>
        <Table>
          <THead><TR><TH>{t("audit.cols.when")}</TH><TH>{t("tax.cols.declaration")}</TH><TH>{t("audit.cols.user")}</TH><TH>{t("decl.transition")}</TH></TR></THead>
          <TBody>
            {events.map((e) => (
              <TR key={e.id}>
                <TD className="tabular whitespace-nowrap">{f.dateTime(e.createdAt)}</TD>
                <TD><Link className="text-primary hover:underline" href={`/app/tax/declarations/${e.declaration.id}`}>{label(e.declaration)}</Link></TD>
                <TD>{e.userId ? users.get(e.userId) ?? "—" : t("audit.system")}</TD>
                <TD>{e.fromStatus ? <>{t(`decl.status.${e.fromStatus}`)} → </> : null}<strong>{t(`decl.status.${e.toStatus}`)}</strong></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
