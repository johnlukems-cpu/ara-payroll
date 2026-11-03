import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/server/admin-page";
import { getI18n } from "@/lib/server/i18n";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("saas.nav.plans") };
}

/** Configurable subscription plans. Prices shown here apply to new subscriptions; existing contracts keep their agreed terms. */
export default async function PlansPage() {
  await requireAdminPage();
  const { t, f, locale } = await getI18n();
  const plans = await db.plan.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { subscriptions: { where: { status: { in: ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED"] } } } } } },
  });
  const price = (v: number | null, cur: string) => (v == null ? t("pricing.onRequest") : f.money(v, cur));
  return (
    <div className="space-y-6">
      <PageHeader title={t("saas.plans.title")} description={t("saas.plans.subtitle")} actions={<Link href="/admin/plans/new" className={buttonVariants()}>{t("saas.plans.new")}</Link>} />
      <Card>
        <Table>
          <THead><TR>
            <TH>{t("saas.plans.name")}</TH><TH className="text-right">{t("saas.plans.monthlyPrice")}</TH><TH className="text-right">{t("saas.plans.yearlyPrice")}</TH>
            <TH className="text-right">{t("saas.plans.maxEmployees")}</TH><TH className="text-right">{t("saas.plans.trialDays")}</TH><TH className="text-right">{t("saas.plans.subscriptions")}</TH><TH>{t("saas.customers.cols.status")}</TH>
          </TR></THead>
          <TBody>
            {plans.map((p) => (
              <TR key={p.id} data-testid={`plan-row-${p.code}`}>
                <TD><Link href={`/admin/plans/${p.id}`} className="font-medium text-primary hover:underline">{locale === "en" ? p.nameEn : p.nameNl}</Link><span className="block text-xs text-muted-foreground">{p.code}{p.popular ? ` · ${t("pricing.popular")}` : ""}</span></TD>
                <TD className="tabular text-right">{price(p.monthlyPrice, p.currency)}</TD>
                <TD className="tabular text-right">{price(p.yearlyPrice, p.currency)}</TD>
                <TD className="tabular text-right">{p.maxEmployees ?? "∞"}</TD>
                <TD className="tabular text-right">{p.trialDays}</TD>
                <TD className="tabular text-right">{p._count.subscriptions}</TD>
                <TD className="space-x-1">
                  <Badge variant={p.isActive ? "success" : "muted"}>{t(p.isActive ? "saas.plans.active" : "saas.plans.inactive")}</Badge>
                  {p.isPublished && <Badge variant="accent">{t("saas.plans.published")}</Badge>}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <p className="text-xs text-muted-foreground">{t("saas.plans.contractNote")}</p>
    </div>
  );
}
