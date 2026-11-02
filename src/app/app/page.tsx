import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { can } from "@/lib/permissions";
import { findRuleSet } from "@/lib/payroll/service";
import { money, periodLabel, date, MONTHS, daysAgo } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { PayrollTrend } from "@/components/charts/payroll-trend";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ welcome?: string; denied?: string }> }) {
  const ctx = await requirePage();
  const sp = await searchParams;
  const companyId = ctx.company.id;
  const showPay = can(ctx.role, "payroll.view");

  const [activeCount, newHires, pendingLeave, runs, ruleSet] = await Promise.all([
    db.employee.count({ where: { companyId, status: { not: "TERMINATED" } } }),
    db.employee.count({ where: { companyId, hireDate: { gte: daysAgo(30) } } }),
    db.leaveRequest.count({ where: { employee: { companyId }, status: "PENDING" } }),
    showPay ? db.payrollRun.findMany({ where: { companyId }, orderBy: [{ year: "desc" }, { month: "desc" }], take: 12 }) : Promise.resolve([]),
    findRuleSet(companyId, new Date()),
  ]);
  const last = runs.find((r) => r.status !== "DRAFT");
  const trend = [...runs].reverse().filter((r) => r.status !== "DRAFT").map((r) => ({
    label: `${MONTHS[r.month - 1].slice(0, 3)} ${String(r.year).slice(2)}`,
    net: r.totalNet / 100,
    tax: r.totalWageTax / 100,
    aov: r.totalAov / 100,
  }));

  return (
    <div>
      <PageHeader
        title={`Good day, ${ctx.user.name.split(" ")[0]}`}
        description={`${ctx.company.name} · Payroll overview`}
        actions={can(ctx.role, "payroll.run") && <Link href="/app/payroll/new" className={buttonVariants({ variant: "accent" })}>New payroll run</Link>}
      />
      <div className="mb-6 space-y-3">
        {sp.welcome && <Alert variant="success">Welcome to ARA Payroll! Start by completing your company details in Settings, then add your employees.</Alert>}
        {sp.denied && <Alert variant="error">You don&apos;t have access to that page.</Alert>}
        {!ruleSet && <Alert variant="warning">No tax rule set is configured. Payroll cannot be calculated until one is added under Settings → Tax rules.</Alert>}
        {ruleSet && !ruleSet.isVerified && can(ctx.role, "settings.manage") && (
          <Alert variant="warning">
            The active tax rule set <strong>{ruleSet.name}</strong> has not been verified. Confirm all rates against current Belastingdienst Suriname publications before running production payroll.{" "}
            <Link href="/app/settings/tax" className="font-medium underline">Review tax rules</Link>
          </Alert>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active employees" value={activeCount} sub={`${newHires} hired in the last 30 days`} />
        {showPay ? (
          <>
            <Stat label="Last net payroll" value={last ? money(last.totalNet) : "—"} sub={last ? periodLabel(last.year, last.month) : "No runs yet"} />
            <Stat label="Wage tax (last run)" value={last ? money(last.totalWageTax) : "—"} sub={last ? `AOV ${money(last.totalAov)}` : undefined} />
            <Stat label="Employer cost (last run)" value={last ? money(last.totalEmployer) : "—"} />
          </>
        ) : (
          <Stat label="Pending leave requests" value={pendingLeave} />
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {showPay && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Payroll trend</CardTitle>
              <CardDescription>Net pay, wage tax and AOV per period</CardDescription>
            </CardHeader>
            <CardContent>
              {trend.length ? <PayrollTrend data={trend} /> : <EmptyState title="No calculated payroll yet" description="Your monthly payroll totals will appear here." />}
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Attention</CardTitle>
            <CardDescription>Items awaiting action</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Link href="/app/leave" className="flex items-center justify-between rounded-lg border px-3 py-2.5 hover:bg-muted">
              <span>Pending leave requests</span><span className="font-semibold">{pendingLeave}</span>
            </Link>
            {runs.filter((r) => r.status === "CALCULATED" || r.status === "DRAFT").map((r) => (
              <Link key={r.id} href={`/app/payroll/${r.id}`} className="flex items-center justify-between rounded-lg border px-3 py-2.5 hover:bg-muted">
                <span>Payroll {periodLabel(r.year, r.month)}</span><StatusBadge status={r.status} />
              </Link>
            ))}
            {runs.filter((r) => r.status === "APPROVED").map((r) => (
              <Link key={r.id} href={`/app/payroll/${r.id}`} className="flex items-center justify-between rounded-lg border px-3 py-2.5 hover:bg-muted">
                <span>Pay {periodLabel(r.year, r.month)} by {date(r.payDate)}</span><ArrowRight className="h-4 w-4" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
