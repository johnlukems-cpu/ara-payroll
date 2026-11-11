import { HEALTH_DEFAULT, HEALTH_DEFAULT_NOTE_EN, HEALTH_DEFAULT_NOTE_NL } from "@/lib/payroll/statutory";
import Link from "next/link";
import { CheckCircle2, CircleAlert, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { describeBase, describeShare } from "@/lib/contribution-format";
import { CONTRIBUTION_TYPES, schemeIssues, schemeState, statutoryGaps } from "@/lib/payroll/contributions";
import { periodBounds } from "@/lib/payroll/service";
import { pensionCoveredByContracts } from "@/lib/server/pay-components";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, EmptyState, Stat } from "@/components/ui/misc";
import { LegalBadge } from "@/components/legal-badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { IssueList, StateBadge } from "./status";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("settings.tabs.contributions") };
}

/** Contribution schemes (health insurance, pension, FVO) with separate employee and employer shares, and their validation. */
export default async function ContributionsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const ctx = await requirePage("settings.manage");
  const { t, f } = await getI18n();
  const tt = t as unknown as (k: string, v?: Record<string, string | number>) => string;
  const sp = await searchParams;
  const schemes = await db.contributionScheme.findMany({
    where: { companyId: ctx.company.id },
    orderBy: [{ type: "asc" }, { effectiveFrom: "desc" }],
    include: { _count: { select: { enrollments: true } } },
  });
  const now = new Date();
  // Custom components that look like health insurance, pension or FVO but are not linked to the library:
  // they cannot be detected automatically, so the administrator is asked to check them (no double deduction).
  const lookalikes = await db.payComponent.findMany({
    where: {
      companyId: ctx.company.id, isActive: true, kind: { in: ["DEDUCTION", "EMPLOYER"] }, libraryCode: null,
      assignments: { some: { isActive: true, OR: [{ endDate: null }, { endDate: { gte: now } }] } },
      OR: ["ziektekosten", "basiszorg", "health", "pensioen", "pension", "fvo"].map((w) => ({ name: { contains: w, mode: "insensitive" as const } })),
    },
    select: { code: true, name: true },
  });

  // Validation overview: current versions (not ended), their state and issues, and the coverage of the current period.
  const current = schemes.filter((s) => !s.effectiveTo || s.effectiveTo >= now);
  const rows = current.map((s) => ({ s, state: schemeState(s, now), issues: schemeIssues(s) }));
  const count = (states: string[]) => rows.filter((r) => states.includes(r.state)).length;
  const { start, end } = periodBounds(now.getUTCFullYear(), now.getUTCMonth() + 1);
  const pensionByContract = await pensionCoveredByContracts(ctx.company.id, now.getUTCFullYear(), now.getUTCMonth() + 1);
  const gaps = statutoryGaps(schemes, start, end, pensionByContract ? ["PENSION"] : []);
  const register = await db.legalSource.findMany({ where: { code: { in: ["FVO", "WAP-2014", "WNBZ-2014"] } }, select: { code: true, verificationStatus: true, summary: true } });
  const fvoSource = register.find((r) => r.code === "FVO");

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{t("contrib.intro")}</p>
      {sp.saved && <Alert variant="success">{t("contrib.savedDraft")}</Alert>}
      <Alert variant="info">{t("contrib.noInventedRates")}</Alert>
      {schemes.some((x) => x.type === "HEALTH" && (x.notes === HEALTH_DEFAULT_NOTE_NL || x.notes === HEALTH_DEFAULT_NOTE_EN) && x.employeeRateBp === HEALTH_DEFAULT.employeeRateBp && x.employerRateBp === HEALTH_DEFAULT.employerRateBp) && (
        <Alert variant="warning"><span data-testid="health-default-notice">{t("contrib.healthDefaultNotice")}</span></Alert>
      )}
      {fvoSource && fvoSource.verificationStatus !== "VERIFIED" && (
        <Alert variant="warning"><span data-testid="fvo-notice">{t("contrib.fvoNotice", { status: t(`legal.${fvoSource.verificationStatus}`) })}</span> <Link href="/app/tax/legal#FVO" className="font-medium underline">{t("contrib.seeLegalSources")}</Link></Alert>
      )}
      {pensionByContract && <Alert variant="info">{t("contrib.pensionByContract")}</Alert>}
      {lookalikes.length > 0 && <Alert variant="warning">{t("contrib.lookalikes", { list: lookalikes.map((c) => `${c.name} (${c.code})`).join(", ") })}</Alert>}

      <Card data-testid="validation-overview">
        <CardHeader>
          <CardTitle>{t("contrib.validationTitle")}</CardTitle>
          <CardDescription>{t("contrib.validationSub")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label={t("contrib.count.active")} value={count(["ACTIVE", "FUTURE"])} />
            <Stat label={t("contrib.count.inactive")} value={count(["INACTIVE", "NOT_APPLICABLE"])} />
            <Stat label={t("contrib.count.incomplete")} value={count(["NOT_CONFIGURED", "AWAITING_APPROVAL"])} className={count(["NOT_CONFIGURED", "AWAITING_APPROVAL"]) ? "border-destructive/40" : ""} />
          </div>
          {gaps.length > 0 ? (
            <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive" data-testid="payroll-blocked">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              {t("contrib.payrollBlocked", { period: f.period(now.getUTCFullYear(), now.getUTCMonth() + 1), list: gaps.map((g) => t(`enums.contributionType.${g}`)).join(", ") })}
            </p>
          ) : (
            <p className="flex items-start gap-2 rounded-lg border border-success/40 bg-success/5 px-3 py-2 text-sm" data-testid="payroll-ready">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              {t("contrib.payrollReady", { period: f.period(now.getUTCFullYear(), now.getUTCMonth() + 1) })}
            </p>
          )}
        </CardContent>
        <Table>
          <THead><TR>
            <TH>{t("contrib.cols.type")}</TH><TH>{t("contrib.cols.name")}</TH><TH>{t("contrib.cols.basis")}</TH>
            <TH className="text-right">{t("contrib.employeeShare")}</TH><TH className="text-right">{t("contrib.employerShare")}</TH>
            <TH>{t("contrib.cols.status")}</TH><TH>{t("contrib.cols.issues")}</TH><TH />
          </TR></THead>
          <TBody>
            {rows.map(({ s, state, issues }) => (
              <TR key={s.id} data-testid={`validation-${s.type}`}>
                <TD className="font-medium">{t(`enums.contributionType.${s.type}`)}</TD>
                <TD>{s.name}<span className="block text-xs text-muted-foreground">{f.date(s.effectiveFrom)} – {s.effectiveTo ? f.date(s.effectiveTo) : t("assign.openEnded")}</span></TD>
                <TD className="text-xs">{t(`enums.contributionBasis.${s.basis}`)}</TD>
                <TD className="tabular text-right">{describeShare(s, "employee", f)}</TD>
                <TD className="tabular text-right">{describeShare(s, "employer", f)}</TD>
                <TD><StateBadge state={state} t={tt} /></TD>
                <TD className="min-w-56"><IssueList issues={issues} t={tt} /></TD>
                <TD className="text-right"><Link href={`/app/settings/contributions/${s.id}`} className="whitespace-nowrap text-primary hover:underline">{t("contrib.configure")}</Link></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      {CONTRIBUTION_TYPES.map((type) => {
        const list = schemes.filter((s) => s.type === type);
        return (
          <Card key={type} data-testid={`scheme-${type}`}>
            <CardHeader className="flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div><CardTitle>{t(`enums.contributionType.${type}`)}</CardTitle><CardDescription>{t(`contrib.typeHint.${type}`)}</CardDescription></div>
              <Link href={`/app/settings/contributions/new?type=${type}`} className={buttonVariants({ variant: "outline", size: "sm" })}><Plus /> {t("contrib.newScheme")}</Link>
            </CardHeader>
            {list.length === 0 ? <EmptyState title={t("contrib.none")} /> : (
              <Table>
                <THead><TR>
                  <TH>{t("contrib.cols.name")}</TH><TH>{t("contrib.cols.basis")}</TH><TH className="text-right">{t("contrib.employeeShare")}</TH><TH className="text-right">{t("contrib.employerShare")}</TH>
                  <TH>{t("contrib.cols.base")}</TH><TH>{t("contrib.cols.validity")}</TH><TH>{t("contrib.cols.legal")}</TH><TH>{t("contrib.cols.status")}</TH><TH />
                </TR></THead>
                <TBody>
                  {list.map((s) => (
                    <TR key={s.id}>
                      <TD className="font-medium">{s.name}<span className="block text-xs font-normal text-muted-foreground">{s.appliesToAll ? t("contrib.allEmployees") : t("contrib.enrolledOnly", { count: s._count.enrollments })}</span></TD>
                      <TD className="text-xs">{t(`enums.contributionBasis.${s.basis}`)}</TD>
                      <TD className="tabular text-right">{describeShare(s, "employee", f)}</TD>
                      <TD className="tabular text-right">{describeShare(s, "employer", f)}</TD>
                      <TD className="text-xs">{describeBase(s, tt, f)}</TD>
                      <TD className="tabular whitespace-nowrap text-xs">{f.date(s.effectiveFrom)} – {s.effectiveTo ? f.date(s.effectiveTo) : t("assign.openEnded")}</TD>
                      <TD><LegalBadge status={s.legalStatus} /></TD>
                      <TD><StateBadge state={schemeState(s, now)} t={tt} /></TD>
                      <TD className="text-right"><Link href={`/app/settings/contributions/${s.id}`} className="text-primary hover:underline">{t("common.edit")}</Link></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        );
      })}
      {schemes.some((s) => s.notApplicable) && (
        <p className="text-xs text-muted-foreground">{t("contrib.notApplicableList", { list: schemes.filter((s) => s.notApplicable).map((s) => s.name).join(", ") })}</p>
      )}
    </div>
  );
}
