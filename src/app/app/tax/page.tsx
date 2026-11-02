import Link from "next/link";
import { Bell, ExternalLink } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { can } from "@/lib/permissions";
import { findAovRuleSet, findRuleSet, isLegallyValid } from "@/lib/payroll/service";
import { monthlyDeadline } from "@/lib/declarations/status";
import { ActionForm } from "@/components/action-form";
import { ActionButton } from "@/components/confirm-button";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { Alert, Stat } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DeclarationStatusBadge } from "./status-badge";
import { markNotificationsReadAction, prepareDeclarationAction } from "@/app/actions/declarations";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("tax.title") };
}

export default async function TaxDashboard() {
  const ctx = await requirePage("tax.view");
  const { t, f } = await getI18n();
  const companyId = ctx.company.id;
  const now = new Date();
  const [declarations, runs, notifications, taxRule, aovRule] = await Promise.all([
    db.declaration.findMany({ where: { companyId, type: "LB_AOV_MONTHLY" }, orderBy: [{ year: "desc" }, { month: "desc" }, { version: "desc" }], include: { files: { select: { downloadCount: true } } } }),
    db.payrollRun.findMany({ where: { companyId }, orderBy: [{ year: "desc" }, { month: "desc" }], take: 12 }),
    db.notification.findMany({ where: { companyId, readAt: null }, orderBy: { createdAt: "desc" }, take: 10 }),
    findRuleSet(companyId, now),
    findAovRuleSet(companyId, now),
  ]);
  const latest = new Map<string, (typeof declarations)[number]>();
  for (const d of declarations) if (!latest.has(`${d.year}-${d.month}`)) latest.set(`${d.year}-${d.month}`, d);
  // Periods: every payroll run period, plus periods that only have declarations.
  const periods = [...new Set([...runs.map((r) => `${r.year}-${r.month}`), ...latest.keys()])]
    .map((k) => k.split("-").map(Number) as [number, number])
    .sort((a, b) => b[0] - a[0] || b[1] - a[1])
    .slice(0, 12);
  const open = [...latest.values()].filter((d) => !["PAID", "ACCEPTED"].includes(d.status));
  const due = open.filter((d) => d.deadline >= now).sort((a, b) => +a.deadline - +b.deadline)[0];
  const overdue = open.filter((d) => d.deadline < now && !["SUBMITTED"].includes(d.status)).length;
  const outstanding = open.filter((d) => d.status !== "PAID").reduce((s, d) => s + d.totalPayable, 0);
  const rulesValid = isLegallyValid(taxRule, now) && isLegallyValid(aovRule, now);

  return (
    <div className="space-y-6">
      {!rulesValid && (
        <Alert variant="warning">
          {t("tax.rulesPending")} <Link href="/app/tax/legal" className="font-medium underline">{t("tax.viewLegal")}</Link>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("tax.stats.nextDeadline")} value={due ? f.date(due.deadline) : "—"} sub={due ? f.period(due.year, due.month) : undefined} />
        <Stat label={t("tax.stats.outstanding")} value={f.money(outstanding, "SRD")} />
        <Stat label={t("tax.stats.open")} value={open.length} />
        <Stat label={t("tax.stats.overdue")} value={overdue} className={overdue ? "border-destructive/40" : undefined} />
      </div>

      {notifications.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Bell className="h-4 w-4" /> {t("tax.notifications")}</CardTitle>
            <ActionButton action={markNotificationsReadAction} variant="ghost" size="sm">{t("tax.markRead")}</ActionButton>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {notifications.map((n) => {
              const p = n.params as { year: number; month: number };
              return (
                <Link key={n.id} href={n.link ?? "/app/tax"} className="flex items-center justify-between rounded-lg border px-3 py-2 hover:bg-muted">
                  <span>{t("tax.notification.draft", { period: f.period(p.year, p.month) })}</span>
                  <span className="text-xs text-muted-foreground">{f.dateTime(n.createdAt)}</span>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("tax.dashboardTitle")}</CardTitle>
          <CardDescription>{t("tax.dashboardSub")}</CardDescription>
        </CardHeader>
        <Table>
          <THead><TR><TH>{t("tax.cols.period")}</TH><TH>{t("tax.cols.deadline")}</TH><TH className="text-right">{t("tax.cols.payable")}</TH><TH>{t("tax.cols.status")}</TH><TH>{t("tax.cols.download")}</TH><TH>{t("tax.cols.submission")}</TH><TH>{t("tax.cols.payment")}</TH><TH /></TR></THead>
          <TBody>
            {periods.map(([y, m]) => {
              const d = latest.get(`${y}-${m}`);
              const deadline = d?.deadline ?? monthlyDeadline(y, m, ctx.company.declarationDueDay);
              const downloads = d?.files.reduce((s, x) => s + x.downloadCount, 0) ?? 0;
              return (
                <TR key={`${y}-${m}`}>
                  <TD className="font-medium">{f.period(y, m)}{d && d.version > 1 && <Badge variant="muted" className="ml-2">v{d.version}</Badge>}</TD>
                  <TD className={`tabular ${deadline < now && d?.status !== "PAID" && d?.status !== "SUBMITTED" && d?.status !== "ACCEPTED" ? "text-destructive" : ""}`}>{f.date(deadline)}</TD>
                  <TD className="tabular text-right">{d ? f.money(d.totalPayable, d.currency) : "—"}</TD>
                  <TD>{d ? <DeclarationStatusBadge status={d.status} /> : <Badge variant="muted">{t("decl.status.NOT_STARTED")}</Badge>}</TD>
                  <TD className="text-xs">{!d || !d.files.length ? t("tax.download.none") : downloads ? t("tax.download.downloaded", { count: downloads }) : t("tax.download.ready")}</TD>
                  <TD className="text-xs">{d?.submittedAt ? `${f.date(d.submittedAt)} · ${d.submissionReference}` : t("tax.notSubmitted")}</TD>
                  <TD className="text-xs">{d?.paidAt ? f.date(d.paidAt) : t("tax.notPaid")}</TD>
                  <TD className="text-right">{d ? <Link href={`/app/tax/declarations/${d.id}`} className="text-primary hover:underline">{t("common.view")}</Link> : can(ctx.role, "declarations.prepare") && (
                    <ActionForm action={prepareDeclarationAction}><input type="hidden" name="year" value={y} /><input type="hidden" name="month" value={m} /><SubmitButton size="sm" variant="outline">{t("tax.prepare")}</SubmitButton></ActionForm>
                  )}</TD>
                </TR>
              );
            })}
            {periods.length === 0 && <TR><TD colSpan={8} className="py-10 text-center text-muted-foreground">{t("tax.noPeriods")}</TD></TR>}
          </TBody>
        </Table>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t("tax.howTitle")}</CardTitle><CardDescription>{t("tax.howSub")}</CardDescription></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ol className="list-decimal space-y-1.5 pl-5">
              {(["1", "2", "3", "4", "5"] as const).map((k) => <li key={k}>{t(`tax.how.${k}`)}</li>)}
            </ol>
            <a href="https://portaal.belastingdienst.sr" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">portaal.belastingdienst.sr <ExternalLink className="h-3.5 w-3.5" /></a>
            <p className="text-xs text-muted-foreground">{t("tax.noApi")}</p>
          </CardContent>
        </Card>
        {can(ctx.role, "declarations.prepare") && (
          <Card>
            <CardHeader><CardTitle>{t("tax.prepareTitle")}</CardTitle><CardDescription>{t("tax.prepareSub")}</CardDescription></CardHeader>
            <CardContent>
              <ActionForm action={prepareDeclarationAction} className="flex flex-wrap items-end gap-2">
                <Select name="month" defaultValue={now.getUTCMonth() || 12} className="w-48" aria-label={t("payroll.month")}>
                  <option value={0}>{t("tax.annualStatement")}</option>
                  {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{f.month(i + 1)}</option>)}
                </Select>
                <Input name="year" type="number" defaultValue={now.getUTCFullYear()} className="w-28" aria-label={t("payroll.year")} />
                <SubmitButton variant="outline">{t("tax.prepare")}</SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
