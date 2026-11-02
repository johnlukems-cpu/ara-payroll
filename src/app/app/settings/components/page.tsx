import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { ActionButton } from "@/components/confirm-button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LegalBadge } from "@/components/legal-badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { adoptLibraryAction, toggleComponentAction } from "@/app/actions/settings";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("settings.tabs.components") };
}

const CATEGORIES = ["SALARY", "ALLOWANCE", "OVERTIME", "BONUS", "DEDUCTION", "EMPLOYER", "LEAVE"] as const;

export default async function ComponentsPage() {
  const ctx = await requirePage("settings.manage");
  const { t, f, locale } = await getI18n();
  const [list, library] = await Promise.all([
    db.payComponent.findMany({ where: { companyId: ctx.company.id }, orderBy: [{ code: "asc" }] }),
    db.componentLibrary.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  const adopted = new Set(list.map((c) => c.libraryCode ?? c.code));
  const missing = library.filter((l) => !l.isSystem && !adopted.has(l.code));
  const name = (c: { name?: string; nameNl: string | null; nameEn: string | null }) => (locale === "en" ? c.nameEn : c.nameNl) ?? c.name ?? "";
  const categoryOf = (c: (typeof list)[number]) => c.category ?? (c.kind === "DEDUCTION" ? "DEDUCTION" : c.kind === "EMPLOYER" ? "EMPLOYER" : "ALLOWANCE");
  const method = (c: (typeof list)[number]) => {
    if (c.calcType === "FIXED" || c.calcType === "MANUAL") return c.defaultAmount ? f.money(c.defaultAmount, c.currency ?? ctx.company.currency) : t(`components.calc.${c.calcType}`);
    if (c.calcType === "PERCENT_OF_BASE" || c.calcType === "PERCENT_OF_COMPONENT") return `${c.defaultRateBp ? f.pct(c.defaultRateBp) : "%"}${c.calcType === "PERCENT_OF_COMPONENT" ? ` × ${c.baseComponentCode ?? "?"}` : ""}`;
    if (c.calcType === "HOURS_X_RATE" || c.calcType === "DAYS_X_RATE") return `${t(`components.calc.${c.calcType}`)} × ${f.pct(c.multiplierBp)}`;
    return t(`components.calc.${c.calcType}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("components.intro")}</p>
        <Link href="/app/settings/components/new" className={buttonVariants()}><Plus /> {t("components.newCustom")}</Link>
      </div>
      {CATEGORIES.map((cat) => {
        const items = cat === "LEAVE" ? [] : list.filter((c) => categoryOf(c) === cat);
        const system = library.filter((l) => l.category === cat && l.isSystem);
        if (!items.length && !system.length) return null;
        return (
          <Card key={cat}>
            <CardHeader><CardTitle>{t(`components.category.${cat}`)}</CardTitle><CardDescription>{t(`components.categoryHint.${cat}`)}</CardDescription></CardHeader>
            <Table>
              <THead><TR><TH>{t("components.cols.code")}</TH><TH>{t("components.cols.name")}</TH><TH>{t("components.cols.method")}</TH><TH>{t("components.cols.tax")}</TH><TH>{t("components.cols.flags")}</TH><TH>{t("components.cols.legal")}</TH><TH>{t("components.cols.status")}</TH><TH /></TR></THead>
              <TBody>
                {system.map((l) => (
                  <TR key={l.code} className="bg-muted/30">
                    <TD className="font-mono text-xs">{l.code}</TD>
                    <TD>{name({ nameNl: l.nameNl, nameEn: l.nameEn })}</TD>
                    <TD className="text-xs text-muted-foreground" colSpan={3}>{t("components.systemCalculated")}</TD>
                    <TD><LegalBadge status={l.legalStatus} /></TD>
                    <TD><Badge variant="muted">{t("components.system")}</Badge></TD>
                    <TD />
                  </TR>
                ))}
                {items.map((c) => (
                  <TR key={c.id} className={c.isActive ? "" : "opacity-60"}>
                    <TD className="font-mono text-xs">{c.code}</TD>
                    <TD className="font-medium">{name(c)}{!c.libraryCode && <Badge variant="muted" className="ml-2">{t("components.custom")}</Badge>}</TD>
                    <TD className="text-xs">{method(c)}</TD>
                    <TD className="text-xs">{c.kind === "ALLOWANCE" ? t(`enums.taxTreatment.${c.taxTreatment}`) : c.kind === "DEDUCTION" ? (c.preTax ? t("components.preTax") : t("components.afterTax")) : t("components.employerOnly")}</TD>
                    <TD className="space-x-1 text-xs">
                      {c.kind === "ALLOWANCE" && c.aovIncluded && <Badge variant="muted">AOV</Badge>}
                      {c.pensionIncluded && <Badge variant="muted">{t("components.pension")}</Badge>}
                      {c.netEffect === "NONE" && c.kind === "ALLOWANCE" && <Badge variant="muted">{t("components.inKind")}</Badge>}
                    </TD>
                    <TD><LegalBadge status={c.legalStatus} /></TD>
                    <TD>
                      {c.approvalStatus === "DRAFT" ? <Badge variant="warning">{t("components.draft")}</Badge> : c.isActive ? <Badge variant="success">{t("common.active")}</Badge> : <Badge variant="muted">{t("common.inactive")}</Badge>}
                      {c.isActive && c.availableToAll && cat !== "SALARY" && <Badge variant="accent" className="ml-1">{t("components.inDropdowns")}</Badge>}
                    </TD>
                    <TD className="whitespace-nowrap text-right">
                      <ActionButton action={toggleComponentAction} fields={{ id: c.id, field: "isActive" }} size="sm" variant="ghost">{c.isActive ? t("components.deactivate") : t("components.activate")}</ActionButton>
                      <Link className="ml-2 text-primary hover:underline" href={`/app/settings/components/${c.id}`}>{t("common.edit")}</Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        );
      })}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div><CardTitle>{t("components.libraryTitle")}</CardTitle><CardDescription>{t("components.librarySub", { count: missing.length })}</CardDescription></div>
          {missing.length > 0 && <ActionButton action={adoptLibraryAction} variant="outline">{t("components.adoptAll")}</ActionButton>}
        </CardHeader>
        {missing.length > 0 && (
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {missing.map((l) => (
              <div key={l.code} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <span className="min-w-0"><span className="font-mono text-xs text-muted-foreground">{l.code}</span> <span className="truncate">{name({ nameNl: l.nameNl, nameEn: l.nameEn })}</span></span>
                <ActionButton action={adoptLibraryAction} fields={{ code: l.code }} size="sm" variant="ghost">{t("common.add")}</ActionButton>
              </div>
            ))}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
