import type { Payslip } from "@prisma/client";
import { getI18n } from "@/lib/server/i18n";
import type { BracketSlice } from "@/lib/payroll/engine";
import { LegalBadge } from "@/components/legal-badge";

type Trace = {
  method?: string; regularTaxable?: number; lumpSum?: number; monthlyTaxable?: number; annualZuiverLoon?: number; taxFree?: number;
  annualTaxable?: number; annualTax?: number; brackets?: BracketSlice[]; taxCredit?: number; wageTax?: number; bonusTax?: number;
  overtimeTax?: number; overtimePay?: number; specialRewards?: number; taxableBonus?: number; bonusExemptUsed?: number;
  aov?: { base: string; baseAmount: number; rateBp: number; franchise: number; employeeShareBp: number; exempt: boolean; total: number };
  ruleSet?: string; aovRuleSet?: string; regime?: string; calculatedAt?: string; leave?: { code: string; days: number; payPercentBp: number; reduction: number }[];
};

/** Transparent, auditable breakdown of the wage tax and AOV calculation stored with a payslip. */
export async function PayslipBreakdown({ slip }: { slip: Payslip }) {
  const { t, f } = await getI18n();
  const tr = slip.trace as Trace;
  const cur = slip.calcCurrency;
  const m = (v: number | undefined) => f.money(v ?? 0, cur);
  const row = (label: string, value: string, strong = false) => (
    <div className={`flex justify-between gap-4 border-b border-dashed py-1 last:border-0 ${strong ? "font-semibold" : ""}`}><span>{label}</span><span className="tabular text-right">{value}</span></div>
  );
  return (
    <section id="breakdown" className="mx-auto mt-6 max-w-3xl rounded-xl border bg-card p-6 text-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{t("breakdown.title")}</h2>
        <LegalBadge status={slip.legalStatus} />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("breakdown.wageTax")}</p>
          {row(t("breakdown.regularTaxable"), m(tr.regularTaxable))}
          {row(t("breakdown.lumpSum"), `− ${m(tr.lumpSum)}`)}
          {row(t("breakdown.zuiverLoon"), m(tr.monthlyTaxable))}
          {row(t("breakdown.annualZuiver"), m(tr.annualZuiverLoon))}
          {tr.taxFree ? row(t(tr.method === "MONTHLY_TABLE" ? "breakdown.taxFreeMonthly" : "breakdown.taxFree"), `− ${m(tr.taxFree)}`) : null}
          {row(t("breakdown.annualTaxable"), m(tr.annualTaxable), true)}
          {(tr.brackets ?? []).map((b) => row(t("breakdown.slice", { rate: f.pct(b.rateBp), from: f.number(b.from / 100, 0), to: b.to != null ? f.number(b.to / 100, 0) : "∞" }), `${f.number(b.taxable / 100, 0)} → ${m(b.tax)}`))}
          {tr.method === "MONTHLY_TABLE" ? row(t("breakdown.monthlyTax"), m((tr.wageTax ?? 0) + (tr.taxCredit ?? 0))) : <>{row(t("breakdown.annualTax"), m(tr.annualTax))}{row(t("breakdown.perMonth"), m((tr.annualTax ?? 0) / 12))}</>}
          {tr.taxCredit ? row(t("breakdown.taxCredit"), `− ${m(tr.taxCredit)}`) : null}
          {row(t("breakdown.wageTaxRegular"), m(tr.wageTax), true)}
          {(tr.specialRewards ?? 0) > 0 && <>{row(t("breakdown.specialRewards"), m(tr.specialRewards))}{row(t("breakdown.exemptUsed"), `− ${m(tr.bonusExemptUsed)}`)}{row(t("breakdown.bonusTax"), m(tr.bonusTax), true)}</>}
          {(tr.overtimePay ?? 0) > 0 && <>{row(t("breakdown.overtimePay"), m(tr.overtimePay))}{row(t("breakdown.overtimeTax"), m(tr.overtimeTax), true)}</>}
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("breakdown.aov")}</p>
          {tr.aov ? <>
            {row(t("breakdown.aovBaseType"), t(`aovRules.base.${tr.aov.base}` as never))}
            {tr.aov.exempt ? row(t("breakdown.aovExempt"), "✓") : <>
              {tr.aov.franchise ? row(t("aovRules.franchise"), `− ${m(tr.aov.franchise)}`) : null}
              {row(t("breakdown.aovBase"), m(tr.aov.baseAmount))}
              {row(t("aovRules.rate"), f.pct(tr.aov.rateBp))}
              {row(t("breakdown.aovTotal"), m(tr.aov.total))}
              {row(t("breakdown.aovEmployee"), m(slip.aov), true)}
              {slip.aovEmployer > 0 && row(t("breakdown.aovEmployer"), m(slip.aovEmployer))}
            </>}
          </> : row(t("breakdown.aovBase"), m(slip.aovBaseAmount))}
          {(tr.leave ?? []).length > 0 && <>
            <p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("breakdown.leave")}</p>
            {(tr.leave ?? []).map((l) => row(`${l.code} · ${t("breakdown.leaveLine", { days: f.number(l.days), pct: f.pct(l.payPercentBp) })}`, `− ${m(l.reduction)}`))}
          </>}
          <p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("breakdown.audit")}</p>
          {row(t("breakdown.taxRules"), tr.ruleSet ?? "—")}
          {row(t("breakdown.regime"), t(`rules.regime.${tr.regime ?? "STANDARD"}` as never))}
          {row(t("breakdown.aovRules"), tr.aovRuleSet ?? "—")}
          {row(t("breakdown.method"), t(`rules.calcMethod.${tr.method ?? "ANNUALIZED"}` as never))}
          {tr.calculatedAt && row(t("breakdown.calculatedAt"), f.dateTime(new Date(tr.calculatedAt)))}
        </div>
      </div>
    </section>
  );
}
