import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { getCurrencies } from "@/lib/server/rates";
import { can } from "@/lib/permissions";
import { toDateInput, type Fmt } from "@/lib/format";
import type { Bracket } from "@/lib/payroll/engine";
import { ActionForm, FieldError } from "@/components/action-form";
import { ActionButton } from "@/components/confirm-button";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { CurrencySelect } from "@/components/currency-select";
import { Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { saveTaxRuleSetAction, verifyTaxRuleSetAction } from "@/app/actions/settings";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("settings.tabs.tax") };
}

function BracketRows({ prefix, rows, brackets, unit, f, labels }: { prefix: string; rows: number; brackets: Bracket[]; unit: string; f: Fmt; labels: { header: string; rate: string; upper: (r: number) => string; rateRow: (r: number) => string } }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 text-xs font-medium text-muted-foreground"><span>{labels.header.replace("{unit}", unit)}</span><span>{labels.rate}</span></div>
      {Array.from({ length: rows }, (_, i) => {
        const b = brackets[i];
        return (
          <div key={i} className="grid grid-cols-2 gap-2">
            <Input name={`${prefix}_upto_${i}`} defaultValue={b?.upTo != null ? f.input(b.upTo) : ""} aria-label={labels.upper(i + 1)} />
            <Input name={`${prefix}_rate_${i}`} defaultValue={b ? f.number(b.rateBp / 100) : ""} aria-label={labels.rateRow(i + 1)} />
          </div>
        );
      })}
    </div>
  );
}

export default async function TaxPage({ searchParams }: { searchParams: Promise<{ edit?: string; copy?: string }> }) {
  const ctx = await requirePage("settings.manage");
  const { t, f } = await getI18n();
  const sp = await searchParams;
  const sets = await db.taxRuleSet.findMany({ where: { OR: [{ companyId: ctx.company.id }, { companyId: null }] }, orderBy: { effectiveFrom: "desc" } });
  const currencies = await getCurrencies();
  const base = sets.find((s) => s.id === (sp.edit ?? sp.copy)) ?? sets[0];
  const editing = sp.edit && base?.companyId === ctx.company.id ? base : null;
  const cur = base?.currency ?? "SRD";
  const labels = {
    header: t("settings.tax.upTo", { unit: "{unit}" }),
    rate: t("settings.tax.ratePct"),
    upper: (r: number) => t("settings.tax.bracketUpper", { row: r }),
    rateRow: (r: number) => t("settings.tax.bracketRate", { row: r }),
  };

  return (
    <div className="space-y-6">
      <Alert variant="warning">{t("settings.tax.warning")}</Alert>
      <Card>
        <CardHeader><CardTitle>{t("settings.tax.versions")}</CardTitle><CardDescription>{t("settings.tax.versionsSub")}</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {sets.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{s.name} {s.isVerified ? <Badge variant="success">{t("settings.tax.verified")}</Badge> : <Badge variant="warning">{t("settings.tax.notVerified")}</Badge>} <Badge variant="muted">{s.companyId ? t("settings.tax.companyBadge") : t("settings.tax.platformBadge")}</Badge></p>
                <p className="text-xs text-muted-foreground">{t("settings.tax.summary", { date: f.date(s.effectiveFrom), currency: s.currency, aov: f.pct(s.aovRateBp), credit: f.money(s.taxCreditMonthly, s.currency), top: f.pct((s.brackets as unknown as Bracket[]).at(-1)?.rateBp ?? 0) })}</p>
              </div>
              <div className="flex items-center gap-3">
                {s.companyId && <a href={`?edit=${s.id}`} className="text-primary hover:underline">{t("common.edit")}</a>}
                <a href={`?copy=${s.id}`} className="text-primary hover:underline">{t("settings.tax.newFrom")}</a>
                {s.companyId && !s.isVerified && can(ctx.role, "company.manage") && <ActionButton action={verifyTaxRuleSetAction} fields={{ id: s.id }} size="sm" variant="outline" confirm={t("settings.tax.verifyConfirm")}>{t("settings.tax.markVerified")}</ActionButton>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{editing ? t("settings.tax.editTitle", { name: editing.name }) : t("settings.tax.newTitle")}</CardTitle><CardDescription>{t("settings.tax.unitsHint")}</CardDescription></CardHeader>
        <CardContent>
          <ActionForm action={saveTaxRuleSetAction} className="space-y-6" key={base?.id ?? "new"}>
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("settings.tax.name")} htmlFor="name"><Input id="name" name="name" defaultValue={editing?.name ?? `SR ${new Date().getUTCFullYear()}`} /><FieldError name="name" /></Field>
              <Field label={t("settings.tax.effectiveFrom")} htmlFor="effectiveFrom"><Input id="effectiveFrom" name="effectiveFrom" type="date" defaultValue={toDateInput(editing?.effectiveFrom ?? base?.effectiveFrom)} /><FieldError name="effectiveFrom" /></Field>
              <Field label={t("settings.tax.calcCurrency")} htmlFor="currency" hint={t("settings.tax.calcCurrencyHint")}><CurrencySelect id="currency" name="currency" currencies={currencies} defaultValue={cur} /><FieldError name="currency" /></Field>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div><p className="mb-2 text-sm font-semibold">{t("settings.tax.brackets")}</p><BracketRows prefix="lb" rows={8} brackets={(base?.brackets as unknown as Bracket[]) ?? []} unit={`${cur} ${t("settings.tax.perYear")}`} f={f} labels={labels} /></div>
              <div><p className="mb-2 text-sm font-semibold">{t("settings.tax.overtimeBrackets")}</p><BracketRows prefix="ot" rows={5} brackets={(base?.overtimeBrackets as unknown as Bracket[]) ?? []} unit={`${cur} ${t("settings.tax.perMonth")}`} f={f} labels={labels} /></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={t("settings.tax.taxCredit")} htmlFor="taxCreditMonthly"><Input id="taxCreditMonthly" name="taxCreditMonthly" defaultValue={f.input(base?.taxCreditMonthly)} /><FieldError name="taxCreditMonthly" /></Field>
              <Field label={t("settings.tax.lumpSumRate")} htmlFor="lumpSumRateBp"><Input id="lumpSumRateBp" name="lumpSumRateBp" defaultValue={f.number((base?.lumpSumRateBp ?? 0) / 100)} /><FieldError name="lumpSumRateBp" /></Field>
              <Field label={t("settings.tax.lumpSumCap")} htmlFor="lumpSumCapAnnual"><Input id="lumpSumCapAnnual" name="lumpSumCapAnnual" defaultValue={f.input(base?.lumpSumCapAnnual)} /></Field>
              <Field label={t("settings.tax.aovRate")} htmlFor="aovRateBp"><Input id="aovRateBp" name="aovRateBp" defaultValue={f.number((base?.aovRateBp ?? 0) / 100)} /><FieldError name="aovRateBp" /></Field>
              <Field label={t("settings.tax.aovFranchise")} htmlFor="aovFranchiseMonthly"><Input id="aovFranchiseMonthly" name="aovFranchiseMonthly" defaultValue={f.input(base?.aovFranchiseMonthly)} /></Field>
              <Field label={t("settings.tax.childExempt")} htmlFor="childAllowanceExempt"><Input id="childAllowanceExempt" name="childAllowanceExempt" defaultValue={f.input(base?.childAllowanceExempt)} /></Field>
              <Field label={t("settings.tax.maxChildren")} htmlFor="childAllowanceMaxChildren"><Input id="childAllowanceMaxChildren" name="childAllowanceMaxChildren" defaultValue={base?.childAllowanceMaxChildren ?? 4} /></Field>
              <Field label={t("settings.tax.bonusExempt")} htmlFor="bonusExemptAnnual"><Input id="bonusExemptAnnual" name="bonusExemptAnnual" defaultValue={f.input(base?.bonusExemptAnnual)} /></Field>
            </div>
            <Field label={t("settings.tax.notes")} htmlFor="notes"><Textarea id="notes" name="notes" defaultValue={editing?.notes ?? ""} placeholder={t("settings.tax.notesPlaceholder")} /></Field>
            <div className="flex justify-end"><SubmitButton>{editing ? t("common.saveChanges") : t("settings.tax.createVersion")}</SubmitButton></div>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
