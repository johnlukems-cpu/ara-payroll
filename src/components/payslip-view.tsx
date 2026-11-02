import type { Company, Payslip, PayslipLine, PayrollRun } from "@prisma/client";
import type * as React from "react";
import Image from "next/image";
import { getI18n } from "@/lib/server/i18n";
import { conversionLabel, lineLabel } from "@/lib/payslip-labels";
import type { Conversion } from "@/lib/currency";
import { lineSource, payslipSections, payslipSummary, SUMMARY_ROWS } from "@/lib/payroll/summary";
import type { AccrualState } from "@/lib/payroll/schedule";

type Slip = Payslip & { lines: PayslipLine[]; run: PayrollRun & { company: Company } };

export async function PayslipView({ slip }: { slip: Slip }) {
  const { t, f } = await getI18n();
  const c = slip.run.company;
  const ot = { ot1: c.overtimeRate1Bp, ot2: c.overtimeRate2Bp };
  const tt = t as unknown as (k: string, v?: Record<string, string | number>) => string;
  const label = (l: PayslipLine) => lineLabel(l, tt, f, ot);
  const conversions = (slip.conversions as unknown as Conversion[]) ?? [];
  const cur = slip.calcCurrency;
  const summary = payslipSummary(slip, slip.lines);
  const accruals = Object.values(((slip.trace as { accruals?: Record<string, AccrualState> } | null)?.accruals) ?? {}).filter((a) => a.balance > 0);
  const strong = new Set(["grossPay", "totalDeductions", "totalPayable", "totalEmploymentCost"]);

  const sections = payslipSections(slip, slip.lines);
  type Sec = (typeof sections)["income"];
  const lineRow = (l: PayslipLine) => (
    <tr key={l.id}>
      <td className="py-1 pl-3 pr-2 text-muted-foreground">
        {label(l)}
        {lineSource(l) === "INCIDENTAL" && <span className="ml-1 rounded bg-muted px-1 text-[10px] uppercase">{t("payslip.incidental")}</span>}
        {l.quantity != null && <span className="text-xs"> × {f.number(l.quantity, 4)}</span>}
        {l.rate != null && (l.source === "CONTRIBUTION" || l.code === "PENS" || l.code === "PENS-ER") && <span className="text-xs"> ({f.pct(l.rate)})</span>}
        {l.originalCurrency && <span className="block text-xs">{f.money(l.originalAmount, l.originalCurrency)}</span>}
      </td>
      <td className="tabular py-1 text-right text-muted-foreground">{f.amount(l.amount)}</td>
    </tr>
  );
  // A section per payslip group: group subtotal, then its lines.
  const grouped = (title: string, kind: "earning" | "deduction" | "employer", secs: Sec, total: number, totalLabel: string, extra?: React.ReactNode, testid?: string) => (
    <div data-testid={testid}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <table className="w-full text-sm">
        {secs.map((s) => (
          <tbody key={s.group} className="border-b border-dashed last:border-0">
            <tr className="font-medium"><td className="pt-1.5">{t(`payslip.groups.${kind}.${s.group}` as never)}</td><td className="tabular pt-1.5 text-right">{f.amount(s.total)}</td></tr>
            {(s.lines.length > 1 || label(s.lines[0]) !== t(`payslip.groups.${kind}.${s.group}` as never)) && s.lines.map(lineRow)}
          </tbody>
        ))}
        {secs.length === 0 && !extra && <tbody><tr><td className="py-1.5 text-muted-foreground">—</td></tr></tbody>}
        {extra}
        <tfoot>
          <tr className="border-t font-semibold"><td className="pt-2">{totalLabel}</td><td className="tabular pt-2 text-right">{f.amount(total)}</td></tr>
        </tfoot>
      </table>
    </div>
  );

  return (
    <article className="print-sheet mx-auto max-w-3xl rounded-xl border bg-white p-8 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
        <div>
          <p className="text-lg font-semibold">{c.legalName ?? c.name}</p>
          <p className="text-sm text-muted-foreground">{[c.address, c.district].filter(Boolean).join(", ")}</p>
          {c.taxNumber && <p className="text-xs text-muted-foreground">{t("payslip.taxNo", { value: c.taxNumber })}{c.kkfNumber ? ` · ${t("payslip.kkf", { value: c.kkfNumber })}` : ""}</p>}
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{t("payslip.title")}</p>
          <p className="text-lg font-semibold">{f.period(slip.run.year, slip.run.month)}</p>
          <p className="text-sm text-muted-foreground">{t("payslip.payDate", { date: f.date(slip.run.payDate) })}</p>
        </div>
      </header>
      <section className="grid grid-cols-2 gap-4 border-b py-5 text-sm sm:grid-cols-4">
        <div><p className="text-muted-foreground">{t("payslip.employee")}</p><p className="font-medium">{slip.employeeName}</p></div>
        <div><p className="text-muted-foreground">{t("payslip.employeeNo")}</p><p className="font-medium">{slip.employeeNumber}</p></div>
        <div><p className="text-muted-foreground">{t("payslip.position")}</p><p className="font-medium">{slip.jobTitle ?? "—"}</p></div>
        <div><p className="text-muted-foreground">{t("payslip.bankAccount")}</p><p className="font-medium">{slip.bankAccount ?? "—"}</p></div>
      </section>
      <p className="pt-4 text-xs text-muted-foreground">{t("payslip.calcIn", { currency: cur })}</p>
      <section className="grid gap-8 py-4 sm:grid-cols-2">
        {grouped(t("payslip.income"), "earning", sections.income, slip.grossPay, t("payslip.grossPay"), undefined, "payslip-income")}
        {grouped(t("payslip.employeeDeductions"), "deduction", sections.deductions, slip.totalDeductions, t("payslip.totalDeductions"), undefined, "payslip-deductions")}
      </section>
      <section className="rounded-lg bg-primary px-5 py-4 text-primary-foreground">
        <div className="flex items-center justify-between">
          <span className="text-sm uppercase tracking-wide">{t("payslip.netPay")}</span>
          <span className="tabular text-2xl font-semibold">{f.money(slip.netPayPayment, slip.paymentCurrency)}</span>
        </div>
        {slip.paymentCurrency !== cur && (
          <p className="mt-1 text-right text-xs text-primary-foreground/70">{f.money(slip.netPay, cur)} · {t("payslip.netPaidIn", { currency: slip.paymentCurrency })}</p>
        )}
      </section>
      {/* Employer side: never part of net pay. */}
      <section className="mt-6 grid gap-6 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2" data-testid="payslip-employer">
        {grouped(t("payslip.employerContributions"), "employer", sections.employer, sections.employerTotal, t("payslip.employerTotal"), sections.hiddenEmployer > 0 ? (
          <tbody><tr className="font-medium"><td className="pt-1.5">{t("payslip.otherEmployerCosts")}</td><td className="tabular pt-1.5 text-right">{f.amount(sections.hiddenEmployer)}</td></tr></tbody>
        ) : undefined)}
        <div className="flex flex-col justify-between gap-3 text-sm">
          <p className="text-xs text-muted-foreground">{t("payslip.employerNote")}</p>
          <div className="space-y-1">
            <p className="flex justify-between"><span>{t("payslip.grossPay")}</span><span className="tabular">{f.money(slip.grossPay, cur)}</span></p>
            <p className="flex justify-between"><span>{t("payslip.employerTotal")}</span><span className="tabular">{f.money(sections.employerTotal, cur)}</span></p>
            <p className="flex justify-between border-t pt-1 text-base font-semibold" data-testid="payslip-employment-cost"><span>{t("payslip.totalEmploymentCost")}</span><span className="tabular">{f.money(slip.employerCost, cur)}</span></p>
          </div>
        </div>
      </section>
      <section className="mt-6 border-t pt-4" data-testid="payslip-summary">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("payslip.summaryTitle")}</p>
        <table className="w-full text-sm">
          <tbody>
            {SUMMARY_ROWS.map((k) => (
              <tr key={k} className={strong.has(k) ? "border-t font-semibold" : "border-b border-dashed last:border-0"}>
                <td className="py-1.5">{t(`payslip.summary.${k}`)}</td>
                <td className="tabular py-1.5 text-right">{f.money(summary[k], cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {accruals.length > 0 && (
        <section className="mt-5 rounded-lg border border-dashed p-3 text-xs">
          <p className="mb-1 font-semibold">{t("payslip.accrualsTitle")}</p>
          {accruals.map((a, i) => <p key={i} className="flex justify-between"><span>{a.name ?? a.code}</span><span className="tabular">{f.money(a.balance, cur)}</span></p>)}
        </section>
      )}
      {conversions.length > 0 && (
        <section className="mt-6 border-t pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("payslip.conversions")}</p>
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr><th className="py-1 text-left font-medium">{t("payslip.convCols.item")}</th><th className="text-right font-medium">{t("payslip.convCols.original")}</th><th className="text-right font-medium">{t("payslip.convCols.rate")}</th><th className="text-right font-medium">{t("payslip.convCols.rateDate")}</th><th className="text-right font-medium">{t("payslip.convCols.converted")}</th></tr>
            </thead>
            <tbody>
              {conversions.map((cv, i) => (
                <tr key={i} className="border-t border-dashed">
                  <td className="py-1">{conversionLabel(cv, tt)}</td>
                  <td className="tabular text-right">{f.money(cv.originalAmount, cv.from)}</td>
                  <td className="tabular text-right">1 {cv.from} = {f.rate(cv.rate)} {cv.to}</td>
                  <td className="tabular text-right">{f.date(cv.rateDate)}</td>
                  <td className="tabular text-right">{f.money(cv.convertedAmount, cv.to)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <footer className="mt-8 flex items-center justify-center gap-2 border-t pt-4 text-[11px] text-muted-foreground">
        <Image src="/brand/ara-payroll-icon.png" alt="" width={16} height={16} className="rounded" />
        {t("payslip.generated")}
      </footer>
    </article>
  );
}
