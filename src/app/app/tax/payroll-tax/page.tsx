import Link from "next/link";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { LegalBadge } from "@/components/legal-badge";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PeriodPicker, parsePeriod } from "../period-picker";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("tax.tabs.payrollTax") };
}

type Trace = { monthlyTaxable?: number; annualTaxable?: number; annualTax?: number; taxFree?: number; lumpSum?: number; ruleSet?: string; regime?: string };

export default async function PayrollTaxPage({ searchParams }: { searchParams: Promise<{ year?: string; month?: string }> }) {
  const ctx = await requirePage("tax.view");
  const { t, f } = await getI18n();
  const runs = await db.payrollRun.findMany({ where: { companyId: ctx.company.id, status: { not: "DRAFT" } }, orderBy: [{ year: "desc" }, { month: "desc" }] });
  const { year, month } = parsePeriod(await searchParams, runs[0] ? { year: runs[0].year, month: runs[0].month } : { year: new Date().getUTCFullYear(), month: new Date().getUTCMonth() + 1 });
  const run = runs.find((r) => r.year === year && r.month === month);
  const slips = run ? await db.payslip.findMany({ where: { runId: run.id }, include: { lines: { where: { code: { in: ["LB", "LB-BB", "LB-OT"] } } } }, orderBy: { employeeNumber: "asc" } }) : [];
  const years = [...new Set([new Date().getUTCFullYear(), ...runs.map((r) => r.year)])].sort((a, b) => b - a);
  const yearRuns = runs.filter((r) => r.year === year).sort((a, b) => a.month - b.month);
  const sumCode = (lines: { code: string; amount: number }[], code: string) => lines.filter((l) => l.code === code).reduce((s, l) => s + l.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t("tax.payrollTaxIntro")}</p>
        <PeriodPicker year={year} month={month} years={years} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("tax.breakdownTitle", { period: f.period(year, month) })}</CardTitle>
          <CardDescription>{run ? <>{t("tax.runStatus")}: <StatusBadge status={run.status} /> · <LegalBadge status={run.legalStatus} /></> : t("tax.noRun")}</CardDescription>
        </CardHeader>
        {slips.length === 0 ? <EmptyState title={t("tax.noRun")} /> : (
          <Table>
            <THead><TR><TH>{t("decl.file.colName")}</TH><TH>{t("tax.cols.ruleSet")}</TH><TH className="text-right">{t("tax.cols.zuiverLoon")}</TH><TH className="text-right">{t("tax.cols.taxFree")}</TH><TH className="text-right">{t("tax.cols.annualTaxable")}</TH><TH className="text-right">{t("decl.file.wageTaxRegular")}</TH><TH className="text-right">{t("decl.file.wageTaxSpecial")}</TH><TH className="text-right">{t("decl.file.wageTaxOvertime")}</TH><TH className="text-right">{t("decl.file.wageTax")}</TH><TH /></TR></THead>
            <TBody>
              {slips.map((s) => {
                const tr = s.trace as Trace;
                return (
                  <TR key={s.id}>
                    <TD className="font-medium">{s.employeeName}<span className="block text-xs font-normal text-muted-foreground">#{s.employeeNumber}{tr.regime === "ART17A" && " · art. 17a"}</span></TD>
                    <TD className="max-w-48 truncate text-xs">{tr.ruleSet ?? "—"}</TD>
                    <TD className="tabular text-right">{f.amount((tr.monthlyTaxable ?? 0) * 12)}</TD>
                    <TD className="tabular text-right">{tr.taxFree ? f.amount(tr.taxFree) : "—"}</TD>
                    <TD className="tabular text-right">{f.amount(tr.annualTaxable)}</TD>
                    <TD className="tabular text-right">{f.amount(sumCode(s.lines, "LB"))}</TD>
                    <TD className="tabular text-right">{f.amount(sumCode(s.lines, "LB-BB"))}</TD>
                    <TD className="tabular text-right">{f.amount(sumCode(s.lines, "LB-OT"))}</TD>
                    <TD className="tabular text-right font-semibold">{f.money(s.wageTax, s.calcCurrency)}</TD>
                    <TD className="text-right"><Link className="text-primary hover:underline" href={`/app/payslips/${s.id}#breakdown`}>{t("tax.inspect")}</Link></TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader><CardTitle>{t("tax.yearOverview", { year })}</CardTitle></CardHeader>
        <Table>
          <THead><TR><TH>{t("reports.cols.month")}</TH><TH>{t("reports.cols.status")}</TH><TH>{t("tax.cols.legal")}</TH><TH className="text-right">{t("reports.cols.employees")}</TH><TH className="text-right">{t("reports.cols.wageTax")}</TH><TH className="text-right">{t("reports.cols.aov")}</TH></TR></THead>
          <TBody>
            {yearRuns.map((r) => (
              <TR key={r.id}>
                <TD><Link className="text-primary hover:underline" href={`?year=${r.year}&month=${r.month}`}>{f.month(r.month)}</Link></TD>
                <TD><StatusBadge status={r.status} /></TD><TD><LegalBadge status={r.legalStatus} /></TD>
                <TD className="tabular text-right">{r.employeeCount}</TD>
                <TD className="tabular text-right">{f.money(r.totalWageTax, r.currency)}</TD>
                <TD className="tabular text-right">{f.money(r.totalAov, r.currency)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
