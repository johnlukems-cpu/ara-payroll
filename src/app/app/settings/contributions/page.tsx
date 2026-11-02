import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { describeBase, describeShare } from "@/lib/contribution-format";
import { CONTRIBUTION_TYPES } from "@/lib/payroll/contributions";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, EmptyState } from "@/components/ui/misc";
import { LegalBadge } from "@/components/legal-badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("settings.tabs.contributions") };
}

/** Contribution schemes (health insurance, pension, FVO) with separate employee and employer shares. */
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
  const status = (s: (typeof schemes)[number]) =>
    !s.isActive ? <Badge variant="muted">{t("common.inactive")}</Badge>
      : s.effectiveTo && s.effectiveTo < now ? <Badge variant="muted">{t("contrib.status.ended")}</Badge>
      : s.effectiveFrom > now ? <Badge variant="accent">{t("contrib.status.future")}</Badge>
      : <Badge variant="success">{t("common.active")}</Badge>;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{t("contrib.intro")}</p>
      {sp.saved && <Alert variant="success">{t("contrib.saved")}</Alert>}
      <Alert variant="info">{t("contrib.noInventedRates")}</Alert>
      {lookalikes.length > 0 && <Alert variant="warning">{t("contrib.lookalikes", { list: lookalikes.map((c) => `${c.name} (${c.code})`).join(", ") })}</Alert>}
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
                      <TD>{status(s)}</TD>
                      <TD className="text-right"><Link href={`/app/settings/contributions/${s.id}`} className="text-primary hover:underline">{t("common.edit")}</Link></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        );
      })}
    </div>
  );
}
