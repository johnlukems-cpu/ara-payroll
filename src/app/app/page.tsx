import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { can } from "@/lib/permissions";
import { findRuleSet } from "@/lib/payroll/service";
import { missingStatutoryContributions } from "@/lib/server/pay-components";
import { daysAgo } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { PayrollTrend } from "@/components/charts/payroll-trend";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("dashboard.title") };
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ welcome?: string; denied?: string }> }) {
  const ctx = await requirePage();
  const { t, f } = await getI18n();
  const sp = await searchParams;
  const companyId = ctx.company.id;
  const showPay = can(ctx.role, "payroll.view");

  const [activeCount, newHires, pendingLeave, pendingRates, runs, ruleSet] = await Promise.all([
    db.employee.count({ where: { companyId, status: { not: "TERMINATED" } } }),
    db.employee.count({ where: { companyId, hireDate: { gte: daysAgo(30) } } }),
    db.leaveRequest.count({ where: { employee: { companyId }, status: "PENDING" } }),
    showPay ? db.exchangeRate.count({ where: { companyId, status: "PENDING" } }) : Promise.resolve(0),
    showPay ? db.payrollRun.findMany({ where: { companyId }, orderBy: [{ year: "desc" }, { month: "desc" }], take: 12 }) : Promise.resolve([]),
    findRuleSet(companyId, new Date()),
  ]);
  const now = new Date();
  const missing = showPay ? await missingStatutoryContributions(companyId, now.getUTCFullYear(), now.getUTCMonth() + 1) : [];
  const last = runs.find((r) => r.status !== "DRAFT");
  const baseCur = ctx.company.currency;
  const trend = [...runs].reverse().filter((r) => r.status !== "DRAFT" && r.currency === baseCur).map((r) => ({
    label: `${f.monthShort(r.month)} ${String(r.year).slice(2)}`,
    net: r.totalNet / 100,
    tax: r.totalWageTax / 100,
    aov: r.totalAov / 100,
  }));

  return (
    <div>
      <PageHeader
        title={t("dashboard.greeting", { name: ctx.user.name.split(" ")[0] })}
        description={t("dashboard.subtitle", { company: ctx.company.name })}
        actions={can(ctx.role, "payroll.run") && <Link href="/app/payroll/new" className={buttonVariants({ variant: "accent" })}>{t("dashboard.newRun")}</Link>}
      />
      <div className="mb-6 space-y-3">
        {sp.welcome && <Alert variant="success">{t("dashboard.welcome")}</Alert>}
        {sp.denied && <Alert variant="error">{t("dashboard.denied")}</Alert>}
        {!ruleSet && <Alert variant="warning">{t("dashboard.noRules")}</Alert>}
        {missing.length > 0 && (
          <Alert variant="warning">
            <span data-testid="dashboard-contrib-missing">{t("dashboard.contribMissing", { list: missing.map((m) => t(`enums.contributionType.${m.type}`)).join(", ") })}</span>{" "}
            {can(ctx.role, "settings.manage") && <Link href="/app/settings/contributions" className="font-medium underline">{t("dashboard.contribConfigure")}</Link>}
          </Alert>
        )}
        {ruleSet && !ruleSet.isVerified && can(ctx.role, "settings.manage") && (
          <Alert variant="warning">
            {t("dashboard.unverified", { name: ruleSet.name })}{" "}
            <Link href="/app/settings/tax" className="font-medium underline">{t("dashboard.reviewRules")}</Link>
          </Alert>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("dashboard.activeEmployees")} value={activeCount} sub={t("dashboard.hiredRecently", { count: newHires })} />
        {showPay ? (
          <>
            <Stat label={t("dashboard.lastNet")} value={last ? f.money(last.totalNet, last.currency) : "—"} sub={last ? f.period(last.year, last.month) : t("dashboard.noRuns")} />
            <Stat label={t("dashboard.wageTaxLast")} value={last ? f.money(last.totalWageTax, last.currency) : "—"} sub={last ? t("dashboard.aovSub", { amount: f.money(last.totalAov, last.currency) }) : undefined} />
            <Stat label={t("dashboard.employerCostLast")} value={last ? f.money(last.totalEmployer, last.currency) : "—"} sub={last ? t("dashboard.employerCostsSub", { amount: f.money(last.totalEmployer - last.totalGross, last.currency) }) : undefined} />
          </>
        ) : (
          <Stat label={t("dashboard.pendingLeave")} value={pendingLeave} />
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {showPay && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{t("dashboard.trendTitle")}</CardTitle>
              <CardDescription>{t("dashboard.trendSub", { currency: baseCur })}</CardDescription>
            </CardHeader>
            <CardContent>
              {trend.length ? <PayrollTrend data={trend} currency={baseCur} /> : <EmptyState title={t("dashboard.trendEmpty")} description={t("dashboard.trendEmptyText")} />}
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.attention")}</CardTitle>
            <CardDescription>{t("dashboard.attentionSub")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Link href="/app/leave" className="flex items-center justify-between rounded-lg border px-3 py-2.5 hover:bg-muted">
              <span>{t("dashboard.pendingLeave")}</span><span className="font-semibold">{pendingLeave}</span>
            </Link>
            {pendingRates > 0 && (
              <Link href="/app/exchange-rates?status=PENDING" className="flex items-center justify-between rounded-lg border px-3 py-2.5 hover:bg-muted">
                <span>{t("dashboard.pendingRates")}</span><span className="font-semibold">{pendingRates}</span>
              </Link>
            )}
            {runs.filter((r) => r.status === "CALCULATED" || r.status === "DRAFT").map((r) => (
              <Link key={r.id} href={`/app/payroll/${r.id}`} className="flex items-center justify-between rounded-lg border px-3 py-2.5 hover:bg-muted">
                <span>{t("dashboard.payrollPeriod", { period: f.period(r.year, r.month) })}</span><StatusBadge status={r.status} />
              </Link>
            ))}
            {runs.filter((r) => r.status === "APPROVED").map((r) => (
              <Link key={r.id} href={`/app/payroll/${r.id}`} className="flex items-center justify-between rounded-lg border px-3 py-2.5 hover:bg-muted">
                <span>{t("dashboard.payBy", { period: f.period(r.year, r.month), date: f.date(r.payDate) })}</span><ArrowRight className="h-4 w-4" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
