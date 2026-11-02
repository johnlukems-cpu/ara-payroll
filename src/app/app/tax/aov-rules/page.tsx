import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { getCurrencies } from "@/lib/server/rates";
import { can } from "@/lib/permissions";
import { toDateInput } from "@/lib/format";
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
import { saveAovRuleSetAction, verifyAovRuleSetAction } from "@/app/actions/settings";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("tax.tabs.aovRules") };
}

export default async function AovRulesPage({ searchParams }: { searchParams: Promise<{ edit?: string; copy?: string }> }) {
  const ctx = await requirePage("tax.view");
  const { t, f } = await getI18n();
  const sp = await searchParams;
  const canManage = can(ctx.role, "tax.manage");
  const sets = await db.aovRuleSet.findMany({ where: { OR: [{ companyId: ctx.company.id }, { companyId: null }] }, orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }] });
  const currencies = await getCurrencies();
  const base = sets.find((s) => s.id === (sp.edit ?? sp.copy)) ?? sets[0];
  const editing = sp.edit && base?.companyId === ctx.company.id ? base : null;
  return (
    <div className="space-y-6">
      <Alert variant="info">{t("aovRules.intro")}</Alert>
      <Card>
        <CardHeader><CardTitle>{t("aovRules.versions")}</CardTitle><CardDescription>{t("aovRules.versionsSub")}</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {sets.length === 0 && <p className="text-sm text-muted-foreground">{t("aovRules.none")}</p>}
          {sets.map((s) => (
            <div key={s.id} className="rounded-lg border px-4 py-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{s.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5"><LegalBadge status={s.verificationStatus} /><Badge variant="muted">{s.companyId ? t("settings.tax.companyBadge") : t("settings.tax.platformBadge")}</Badge></div>
                </div>
                <div className="flex gap-3">
                  {canManage && s.companyId && <a href={`?edit=${s.id}`} className="text-primary hover:underline">{t("common.edit")}</a>}
                  {canManage && <a href={`?copy=${s.id}`} className="text-primary hover:underline">{t("settings.tax.newFrom")}</a>}
                </div>
              </div>
              <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <div><dt className="text-muted-foreground">{t("rules.validity")}</dt><dd>{f.date(s.effectiveFrom)} – {s.effectiveTo ? f.date(s.effectiveTo) : t("rules.open")}</dd></div>
                <div><dt className="text-muted-foreground">{t("aovRules.rate")}</dt><dd>{f.pct(s.rateBp)}</dd></div>
                <div><dt className="text-muted-foreground">{t("aovRules.baseLabel")}</dt><dd>{t(`aovRules.base.${s.base}`)}</dd></div>
                <div><dt className="text-muted-foreground">{t("aovRules.franchise")}</dt><dd>{f.money(s.franchiseMonthly, s.currency)}</dd></div>
                <div><dt className="text-muted-foreground">{t("aovRules.minMax")}</dt><dd>{s.minMonthly != null ? f.money(s.minMonthly, s.currency) : "—"} / {s.maxMonthly != null ? f.money(s.maxMonthly, s.currency) : "—"}</dd></div>
                <div><dt className="text-muted-foreground">{t("aovRules.responsibility")}</dt><dd>{t("aovRules.split", { employee: f.pct(s.employeeShareBp), employer: f.pct(10000 - s.employeeShareBp) })}</dd></div>
                <div><dt className="text-muted-foreground">{t("aovRules.exemptFromAge")}</dt><dd>{s.exemptFromAge ?? "—"}</dd></div>
                <div><dt className="text-muted-foreground">{t("rules.verifiedUntil")}</dt><dd>{s.verifiedUntil ? f.date(s.verifiedUntil) : "—"}</dd></div>
              </dl>
              {((s.citations as unknown as Citation[]) ?? []).length > 0 && (
                <ul className="mt-3 space-y-0.5 border-t pt-2 text-xs">{(s.citations as unknown as Citation[]).map((c, i) => <li key={i}><span className="font-medium">{c.source}</span> <span className="text-muted-foreground">— {c.subject}</span></li>)}</ul>
              )}
              {s.notes && <p className="mt-2 text-xs text-muted-foreground">{s.notes}</p>}
              {s.companyId && s.verificationStatus !== "VERIFIED" && can(ctx.role, "company.manage") && <div className="mt-3"><VerifyForm id={s.id} action={verifyAovRuleSetAction} /></div>}
            </div>
          ))}
        </CardContent>
      </Card>
      {canManage && (
        <Card>
          <CardHeader><CardTitle>{editing ? t("settings.tax.editTitle", { name: editing.name }) : t("aovRules.newTitle")}</CardTitle><CardDescription>{t("aovRules.formSub")}</CardDescription></CardHeader>
          <CardContent>
            <ActionForm action={saveAovRuleSetAction} className="space-y-4" key={base?.id ?? "new"}>
              {editing && <input type="hidden" name="id" value={editing.id} />}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label={t("settings.tax.name")} htmlFor="name" className="lg:col-span-2"><Input id="name" name="name" defaultValue={editing?.name ?? `${base?.name ?? "AOV"} (${ctx.company.name})`} /><FieldError name="name" /></Field>
                <Field label={t("settings.tax.calcCurrency")} htmlFor="currency"><CurrencySelect id="currency" name="currency" currencies={currencies} defaultValue={base?.currency ?? "SRD"} /></Field>
                <Field label={t("rules.verificationStatus")} htmlFor="verificationStatus"><Select id="verificationStatus" name="verificationStatus" defaultValue={base?.verificationStatus === "CONFLICT" ? "CONFLICT" : "PENDING_VERIFICATION"}><option value="PENDING_VERIFICATION">{t("legal.PENDING_VERIFICATION")}</option><option value="CONFLICT">{t("legal.CONFLICT")}</option></Select></Field>
                <Field label={t("settings.tax.effectiveFrom")} htmlFor="effectiveFrom"><Input id="effectiveFrom" name="effectiveFrom" type="date" defaultValue={toDateInput(base?.effectiveFrom)} /><FieldError name="effectiveFrom" /></Field>
                <Field label={t("rules.effectiveTo")} htmlFor="effectiveTo"><Input id="effectiveTo" name="effectiveTo" type="date" defaultValue={toDateInput(editing?.effectiveTo)} /></Field>
                <Field label={t("aovRules.rate")} htmlFor="rateBp"><Input id="rateBp" name="rateBp" defaultValue={f.number((base?.rateBp ?? 0) / 100)} /><FieldError name="rateBp" /></Field>
                <Field label={t("aovRules.baseLabel")} htmlFor="base"><Select id="base" name="base" defaultValue={base?.base ?? "TAXABLE_WAGE"}><option value="TAXABLE_WAGE">{t("aovRules.base.TAXABLE_WAGE")}</option><option value="GROSS_WAGE">{t("aovRules.base.GROSS_WAGE")}</option></Select></Field>
                <Field label={t("aovRules.franchise")} htmlFor="franchiseMonthly"><Input id="franchiseMonthly" name="franchiseMonthly" defaultValue={f.input(base?.franchiseMonthly)} /></Field>
                <Field label={t("aovRules.min")} htmlFor="minMonthly"><Input id="minMonthly" name="minMonthly" defaultValue={f.input(base?.minMonthly)} /></Field>
                <Field label={t("aovRules.max")} htmlFor="maxMonthly"><Input id="maxMonthly" name="maxMonthly" defaultValue={f.input(base?.maxMonthly)} /></Field>
                <Field label={t("aovRules.employeeShare")} htmlFor="employeeSharePct" hint={t("aovRules.employeeShareHint")}><Input id="employeeSharePct" name="employeeSharePct" defaultValue={f.number((base?.employeeShareBp ?? 10000) / 100)} /><FieldError name="employeeSharePct" /></Field>
                <Field label={t("aovRules.exemptFromAge")} htmlFor="exemptFromAge"><Input id="exemptFromAge" name="exemptFromAge" type="number" defaultValue={base?.exemptFromAge ?? ""} /><FieldError name="exemptFromAge" /></Field>
              </div>
              <Field label={t("rules.citations")} htmlFor="citations" hint={t("rules.citationsHint")}><Textarea id="citations" name="citations" rows={4} defaultValue={((base?.citations as unknown as Citation[]) ?? []).map((c) => `${c.source} | ${c.article} | ${c.subject}`).join("\n")} /></Field>
              <Field label={t("settings.tax.notes")} htmlFor="notes"><Textarea id="notes" name="notes" defaultValue={base?.notes ?? ""} /></Field>
              <div className="flex justify-end"><SubmitButton>{editing ? t("common.saveChanges") : t("settings.tax.createVersion")}</SubmitButton></div>
            </ActionForm>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
