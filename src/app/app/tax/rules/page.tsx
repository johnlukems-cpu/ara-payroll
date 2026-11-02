import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { getCurrencies } from "@/lib/server/rates";
import { can } from "@/lib/permissions";
import { toDateInput, type Fmt } from "@/lib/format";
import type { Bracket } from "@/lib/payroll/engine";
import type { Citation } from "@/lib/payroll/defaults";
import { ActionForm, FieldError } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { CurrencySelect } from "@/components/currency-select";
import { Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { LegalBadge } from "@/components/legal-badge";
import { VerifyForm } from "@/components/verify-form";
import { saveTaxRuleSetAction, verifyTaxRuleSetAction } from "@/app/actions/settings";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("tax.tabs.rules") };
}

function BracketRows({ prefix, rows, brackets, f, labels }: { prefix: string; rows: number; brackets: Bracket[]; f: Fmt; labels: { header: string; rate: string; upper: (r: number) => string; rateRow: (r: number) => string } }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 text-xs font-medium text-muted-foreground"><span>{labels.header}</span><span>{labels.rate}</span></div>
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

export default async function TaxRulesPage({ searchParams }: { searchParams: Promise<{ edit?: string; copy?: string }> }) {
  const ctx = await requirePage("tax.view");
  const { t, f } = await getI18n();
  const sp = await searchParams;
  const canManage = can(ctx.role, "tax.manage");
  const sets = await db.taxRuleSet.findMany({ where: { OR: [{ companyId: ctx.company.id }, { companyId: null }] }, orderBy: [{ regime: "asc" }, { effectiveFrom: "desc" }, { createdAt: "desc" }] });
  const currencies = await getCurrencies();
  const base = sets.find((s) => s.id === (sp.edit ?? sp.copy)) ?? sets.find((s) => s.approvalStatus === "APPROVED" && s.regime === "STANDARD") ?? sets[0];
  const editing = sp.edit && base?.companyId === ctx.company.id ? base : null;
  const cur = base?.currency ?? "SRD";
  const labels = (unit: string) => ({
    header: t("settings.tax.upTo", { unit }),
    rate: t("settings.tax.ratePct"),
    upper: (r: number) => t("settings.tax.bracketUpper", { row: r }),
    rateRow: (r: number) => t("settings.tax.bracketRate", { row: r }),
  });

  return (
    <div className="space-y-6">
      <Alert variant="warning">{t("settings.tax.warning")}</Alert>
      <Card>
        <CardHeader><CardTitle>{t("settings.tax.versions")}</CardTitle><CardDescription>{t("rules.versionsSub")}</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {sets.map((s) => {
            const citations = (s.citations as unknown as Citation[]) ?? [];
            const brackets = s.brackets as unknown as Bracket[];
            return (
              <div key={s.id} className={`rounded-lg border px-4 py-3 text-sm ${s.approvalStatus !== "APPROVED" ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <LegalBadge status={s.verificationStatus} />
                      <Badge variant={s.regime === "ART17A" ? "warning" : "muted"}>{t(`rules.regime.${s.regime}`)}</Badge>
                      <Badge variant="muted">{s.companyId ? t("settings.tax.companyBadge") : t("settings.tax.platformBadge")}</Badge>
                      {s.approvalStatus !== "APPROVED" && <Badge variant="destructive">{t("rules.withdrawn")}</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {canManage && s.companyId && <a href={`?edit=${s.id}`} className="text-primary hover:underline">{t("common.edit")}</a>}
                    {canManage && <a href={`?copy=${s.id}`} className="text-primary hover:underline">{t("settings.tax.newFrom")}</a>}
                  </div>
                </div>
                <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-4">
                  <div><dt className="text-muted-foreground">{t("rules.validity")}</dt><dd>{f.date(s.effectiveFrom)} – {s.effectiveTo ? f.date(s.effectiveTo) : t("rules.open")}</dd></div>
                  <div><dt className="text-muted-foreground">{t("rules.verifiedUntil")}</dt><dd>{s.verifiedUntil ? f.date(s.verifiedUntil) : "—"}</dd></div>
                  <div><dt className="text-muted-foreground">{t("rules.taxFree")}</dt><dd>{s.taxFreeAnnual ? `${f.money(s.taxFreeAnnual, s.currency)} / ${f.money(s.taxFreeMonthly, s.currency)}` : t("rules.inBrackets")}</dd></div>
                  <div><dt className="text-muted-foreground">{t("rules.lumpSum")}</dt><dd>{s.lumpSumMode === "FIXED" ? `${f.money(s.lumpSumCapAnnual, s.currency)} / ${f.money(s.lumpSumMonthly || s.lumpSumCapAnnual / 12, s.currency)}` : `${f.pct(s.lumpSumRateBp)} (max ${f.money(s.lumpSumCapAnnual, s.currency)})`}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-muted-foreground">{t("rules.brackets")}</dt><dd>{brackets.map((b, i) => `${b.upTo ? `≤ ${f.amount(b.upTo, 2).replace(/[.,]00$/, "")}` : t("rules.above")}: ${f.pct(b.rateBp)}${i < brackets.length - 1 ? "" : ""}`).join(" · ")}</dd></div>
                  <div><dt className="text-muted-foreground">{t("settings.tax.taxCredit")}</dt><dd>{f.money(s.taxCreditMonthly, s.currency)}</dd></div>
                  <div><dt className="text-muted-foreground">{t("rules.method")}</dt><dd>{t(`rules.calcMethod.${s.calcMethod}`)}</dd></div>
                </dl>
                {citations.length > 0 && (
                  <ul className="mt-3 space-y-0.5 border-t pt-2 text-xs">
                    {citations.map((c, i) => <li key={i} className="flex flex-wrap items-center gap-1.5"><span className="font-medium">{c.source}{c.article && c.article !== "—" ? `, art. ${c.article}` : ""}</span><span className="text-muted-foreground">— {c.subject}</span>{c.status && c.status !== "PENDING_VERIFICATION" && <LegalBadge status={c.status} />}</li>)}
                  </ul>
                )}
                {s.notes && <p className="mt-2 text-xs text-muted-foreground">{s.notes}</p>}
                {s.companyId && s.verificationStatus !== "VERIFIED" && can(ctx.role, "company.manage") && <div className="mt-3"><VerifyForm id={s.id} action={verifyTaxRuleSetAction} /></div>}
              </div>
            );
          })}
        </CardContent>
      </Card>
      {canManage && (
        <Card>
          <CardHeader><CardTitle>{editing ? t("settings.tax.editTitle", { name: editing.name }) : t("settings.tax.newTitle")}</CardTitle><CardDescription>{t("rules.formSub")}</CardDescription></CardHeader>
          <CardContent>
            <ActionForm action={saveTaxRuleSetAction} className="space-y-6" key={base?.id ?? "new"}>
              {editing && <input type="hidden" name="id" value={editing.id} />}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label={t("settings.tax.name")} htmlFor="name" className="lg:col-span-2"><Input id="name" name="name" defaultValue={editing?.name ?? `${base?.name ?? "SR"} (${ctx.company.name})`} /><FieldError name="name" /></Field>
                <Field label={t("rules.regimeLabel")} htmlFor="regime" hint={t("rules.regimeHint")}><Select id="regime" name="regime" defaultValue={base?.regime ?? "STANDARD"}><option value="STANDARD">{t("rules.regime.STANDARD")}</option><option value="ART17A">{t("rules.regime.ART17A")}</option></Select></Field>
                <Field label={t("settings.tax.calcCurrency")} htmlFor="currency" hint={t("settings.tax.calcCurrencyHint")}><CurrencySelect id="currency" name="currency" currencies={currencies} defaultValue={cur} /><FieldError name="currency" /></Field>
                <Field label={t("settings.tax.effectiveFrom")} htmlFor="effectiveFrom"><Input id="effectiveFrom" name="effectiveFrom" type="date" defaultValue={toDateInput(editing?.effectiveFrom ?? base?.effectiveFrom)} /><FieldError name="effectiveFrom" /></Field>
                <Field label={t("rules.effectiveTo")} htmlFor="effectiveTo"><Input id="effectiveTo" name="effectiveTo" type="date" defaultValue={toDateInput(editing?.effectiveTo)} /><FieldError name="effectiveTo" /></Field>
                <Field label={t("rules.method")} htmlFor="calcMethod" hint={t("rules.methodHint")}><Select id="calcMethod" name="calcMethod" defaultValue={base?.calcMethod ?? "ANNUALIZED"}><option value="ANNUALIZED">{t("rules.calcMethod.ANNUALIZED")}</option><option value="MONTHLY_TABLE">{t("rules.calcMethod.MONTHLY_TABLE")}</option></Select></Field>
                <Field label={t("rules.verificationStatus")} htmlFor="verificationStatus" hint={t("rules.verificationHint")}><Select id="verificationStatus" name="verificationStatus" defaultValue={base?.verificationStatus === "CONFLICT" ? "CONFLICT" : "PENDING_VERIFICATION"}><option value="PENDING_VERIFICATION">{t("legal.PENDING_VERIFICATION")}</option><option value="CONFLICT">{t("legal.CONFLICT")}</option></Select></Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label={t("rules.taxFreeAnnual")} htmlFor="taxFreeAnnual" hint={t("rules.taxFreeHint")}><Input id="taxFreeAnnual" name="taxFreeAnnual" defaultValue={f.input(base?.taxFreeAnnual)} /><FieldError name="taxFreeAnnual" /></Field>
                <Field label={t("rules.taxFreeMonthly")} htmlFor="taxFreeMonthly"><Input id="taxFreeMonthly" name="taxFreeMonthly" defaultValue={f.input(base?.taxFreeMonthly)} /></Field>
                <Field label={t("rules.lumpSumMode")} htmlFor="lumpSumMode"><Select id="lumpSumMode" name="lumpSumMode" defaultValue={base?.lumpSumMode ?? "PERCENT_CAPPED"}><option value="FIXED">{t("rules.lumpSumModes.FIXED")}</option><option value="PERCENT_CAPPED">{t("rules.lumpSumModes.PERCENT_CAPPED")}</option></Select></Field>
                <Field label={t("settings.tax.lumpSumCap")} htmlFor="lumpSumCapAnnual"><Input id="lumpSumCapAnnual" name="lumpSumCapAnnual" defaultValue={f.input(base?.lumpSumCapAnnual)} /></Field>
                <Field label={t("rules.lumpSumMonthly")} htmlFor="lumpSumMonthly"><Input id="lumpSumMonthly" name="lumpSumMonthly" defaultValue={f.input(base?.lumpSumMonthly)} /></Field>
                <Field label={t("settings.tax.lumpSumRate")} htmlFor="lumpSumRateBp"><Input id="lumpSumRateBp" name="lumpSumRateBp" defaultValue={f.number((base?.lumpSumRateBp ?? 0) / 100)} /><FieldError name="lumpSumRateBp" /></Field>
                <Field label={t("settings.tax.taxCredit")} htmlFor="taxCreditMonthly"><Input id="taxCreditMonthly" name="taxCreditMonthly" defaultValue={f.input(base?.taxCreditMonthly)} /><FieldError name="taxCreditMonthly" /></Field>
                <Field label={t("settings.tax.bonusExempt")} htmlFor="bonusExemptAnnual"><Input id="bonusExemptAnnual" name="bonusExemptAnnual" defaultValue={f.input(base?.bonusExemptAnnual)} /></Field>
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                <div><p className="mb-2 text-sm font-semibold">{t("settings.tax.brackets")}</p><BracketRows prefix="lb" rows={8} brackets={(base?.brackets as unknown as Bracket[]) ?? []} f={f} labels={labels(`${cur} ${t("settings.tax.perYear")}`)} /></div>
                <div><p className="mb-2 text-sm font-semibold">{t("settings.tax.overtimeBrackets")}</p><BracketRows prefix="ot" rows={5} brackets={(base?.overtimeBrackets as unknown as Bracket[]) ?? []} f={f} labels={labels(`${cur} ${t("settings.tax.perMonth")}`)} /></div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label={t("rules.aovLegacyRate")} htmlFor="aovRateBp" hint={t("rules.aovLegacyHint")}><Input id="aovRateBp" name="aovRateBp" defaultValue={f.number((base?.aovRateBp ?? 0) / 100)} /><FieldError name="aovRateBp" /></Field>
                <Field label={t("settings.tax.aovFranchise")} htmlFor="aovFranchiseMonthly"><Input id="aovFranchiseMonthly" name="aovFranchiseMonthly" defaultValue={f.input(base?.aovFranchiseMonthly)} /></Field>
                <Field label={t("settings.tax.childExempt")} htmlFor="childAllowanceExempt"><Input id="childAllowanceExempt" name="childAllowanceExempt" defaultValue={f.input(base?.childAllowanceExempt)} /></Field>
                <Field label={t("settings.tax.maxChildren")} htmlFor="childAllowanceMaxChildren"><Input id="childAllowanceMaxChildren" name="childAllowanceMaxChildren" defaultValue={base?.childAllowanceMaxChildren ?? 4} /></Field>
              </div>
              <Field label={t("rules.citations")} htmlFor="citations" hint={t("rules.citationsHint")}><Textarea id="citations" name="citations" rows={5} defaultValue={((base?.citations as unknown as Citation[]) ?? []).map((c) => `${c.source} | ${c.article} | ${c.subject}`).join("\n")} /></Field>
              <Field label={t("settings.tax.notes")} htmlFor="notes"><Textarea id="notes" name="notes" defaultValue={editing?.notes ?? base?.notes ?? ""} placeholder={t("settings.tax.notesPlaceholder")} /></Field>
              <div className="flex justify-end"><SubmitButton>{editing ? t("common.saveChanges") : t("settings.tax.createVersion")}</SubmitButton></div>
            </ActionForm>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
