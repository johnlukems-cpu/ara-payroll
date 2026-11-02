import { Download } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, EmptyState, Stat } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PeriodPicker, parsePeriod } from "../period-picker";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("tax.tabs.aov") };
}

type AovTrace = { aov?: { base: string; baseAmount: number; rateBp: number; franchise: number; employeeShareBp: number; exempt: boolean; total: number }; aovRuleSet?: string };

export default async function AovPage({ searchParams }: { searchParams: Promise<{ year?: string; month?: string }> }) {
  const ctx = await requirePage("tax.view");
  const { t, f } = await getI18n();
  const runs = await db.payrollRun.findMany({ where: { companyId: ctx.company.id, status: { not: "DRAFT" } }, orderBy: [{ year: "desc" }, { month: "desc" }] });
  const { year, month } = parsePeriod(await searchParams, runs[0] ? { year: runs[0].year, month: runs[0].month } : { year: new Date().getUTCFullYear(), month: new Date().getUTCMonth() + 1 });
  const run = runs.find((r) => r.year === year && r.month === month);
  const slips = run ? await db.payslip.findMany({ where: { runId: run.id }, include: { employee: { select: { idNumber: true, dateOfBirth: true } } }, orderBy: { employeeNumber: "asc" } }) : [];
  const years = [...new Set([new Date().getUTCFullYear(), ...runs.map((r) => r.year)])].sort((a, b) => b - a);
  const cur = slips[0]?.calcCurrency ?? "SRD";
  const total = (k: "aovBaseAmount" | "aov" | "aovEmployer") => slips.reduce((s, x) => s + x[k], 0);
  const ruleName = (slips[0]?.trace as AovTrace | undefined)?.aovRuleSet;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodPicker year={year} month={month} years={years} />
        {run && <a className={buttonVariants({ variant: "outline" })} href={`/api/tax/aov?year=${year}&month=${month}`}><Download /> {t("common.exportCsv")}</a>}
      </div>
      <Alert variant="info">{t("tax.aovIntro")}</Alert>
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label={t("tax.aov.base")} value={f.money(total("aovBaseAmount"), cur)} />
        <Stat label={t("tax.aov.employee")} value={f.money(total("aov"), cur)} sub={t("tax.aov.employeeSub")} />
        <Stat label={t("tax.aov.employer")} value={f.money(total("aovEmployer"), cur)} sub={t("tax.aov.employerSub")} />
        <Stat label={t("tax.aov.payable")} value={f.money(total("aov") + total("aovEmployer"), cur)} sub={t("tax.aov.payableSub")} />
      </div>
      <Card>
        <CardHeader><CardTitle>{t("tax.aov.reportTitle", { period: f.period(year, month) })}</CardTitle><CardDescription>{ruleName ?? "—"}</CardDescription></CardHeader>
        {slips.length === 0 ? <EmptyState title={t("tax.noRun")} /> : (
          <Table>
            <THead><TR><TH>{t("decl.file.colNumber")}</TH><TH>{t("decl.file.colName")}</TH><TH>{t("decl.file.colIdNumber")}</TH><TH>{t("tax.aov.baseType")}</TH><TH className="text-right">{t("decl.file.colAovBase")}</TH><TH className="text-right">{t("tax.aov.rate")}</TH><TH className="text-right">{t("decl.file.colAov")}</TH><TH className="text-right">{t("decl.file.colAovEmployer")}</TH></TR></THead>
            <TBody>
              {slips.map((s) => {
                const a = (s.trace as AovTrace).aov;
                return (
                  <TR key={s.id}>
                    <TD className="tabular">{s.employeeNumber}</TD>
                    <TD>{s.employeeName}{a?.exempt && <span className="block text-xs text-muted-foreground">{t("tax.aov.ageExempt")}</span>}</TD>
                    <TD>{s.employee.idNumber ?? "—"}</TD>
                    <TD className="text-xs">{a ? t(`aovRules.base.${a.base}` as never) : "—"}</TD>
                    <TD className="tabular text-right">{f.amount(s.aovBaseAmount)}</TD>
                    <TD className="tabular text-right">{a ? f.pct(a.rateBp) : "—"}</TD>
                    <TD className="tabular text-right">{f.amount(s.aov)}</TD>
                    <TD className="tabular text-right">{f.amount(s.aovEmployer)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
