import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { getCurrencies } from "@/lib/server/rates";
import { toDateInput } from "@/lib/format";
import { ActionForm, FieldError } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { CurrencySelect } from "@/components/currency-select";
import { Alert } from "@/components/ui/misc";
import { saveComponentConfigAction } from "@/app/actions/settings";
import { bulkAssignAction } from "@/app/actions/employees";
import { ComponentAssignmentForm } from "@/components/component-assignment-form";
import { componentOptions, isStatutory } from "@/lib/server/pay-components";
import { can } from "@/lib/permissions";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("components.configTitle") };
}

const CATEGORIES = ["SALARY", "ALLOWANCE", "OVERTIME", "BONUS", "DEDUCTION", "EMPLOYER"] as const;
const METHODS = ["FIXED", "PERCENT_OF_BASE", "PERCENT_OF_COMPONENT", "HOURS_X_RATE", "DAYS_X_RATE", "QTY_X_PRICE", "FORMULA", "MANUAL"] as const;
const TREATMENTS = ["TAXABLE", "EXEMPT", "EXEMPT_UP_TO_LIMIT", "CHILD_ALLOWANCE", "SPECIAL_REWARD", "OVERTIME"] as const;

function F({ name, label, hint, children, className }: { name: string; label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return <Field label={label} htmlFor={name} hint={hint} className={className}>{children}<FieldError name={name} /></Field>;
}

export default async function ComponentConfigPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const ctx = await requirePage("settings.manage");
  const { t, f, locale } = await getI18n();
  const { id } = await params;
  const isNew = id === "new";
  const c = isNew ? null : await db.payComponent.findFirst({ where: { id, companyId: ctx.company.id } });
  if (!isNew && !c) notFound();
  const [currencies, others] = await Promise.all([getCurrencies(), db.payComponent.findMany({ where: { companyId: ctx.company.id, kind: "ALLOWANCE" }, select: { code: true }, orderBy: { code: "asc" } })]);
  const sp = await searchParams;
  // Assign this component to several employees at once (only active, approved, non-statutory components).
  const bulkOption = c && can(ctx.role, "employees.edit") && c.isActive && c.approvalStatus === "APPROVED" && !isStatutory(c)
    ? (await componentOptions(ctx.company.id, locale)).find((o) => o.value === c.id) ?? null
    : null;
  const employees = bulkOption
    ? (await db.employee.findMany({ where: { companyId: ctx.company.id, status: { not: "TERMINATED" } }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], select: { id: true, firstName: true, lastName: true } })).map((e) => ({ id: e.id, name: `${e.lastName}, ${e.firstName}` }))
    : [];
  const baseOptions = (await db.payComponent.findMany({ where: { companyId: ctx.company.id, isActive: true }, orderBy: { name: "asc" } })).filter((x) => !isStatutory(x)).map((x) => ({ code: x.code, name: (locale === "en" ? x.nameEn : x.nameNl) || x.name }));
  const category = c?.category ?? (c?.kind === "DEDUCTION" ? "DEDUCTION" : "ALLOWANCE");

  return (
    <div className="space-y-6">
      <Link href="/app/settings/components" className={buttonVariants({ variant: "ghost" })}><ArrowLeft /> {t("components.back")}</Link>
      {sp.created && <Alert variant="success">{t("settings.components.saved")}</Alert>}
      {c?.libraryCode && <Alert variant="info">{t("components.fromLibrary", { code: c.libraryCode })}</Alert>}
      <ActionForm action={saveComponentConfigAction} className="space-y-6">
        {c && <input type="hidden" name="id" value={c.id} />}
        <Card>
          <CardHeader><CardTitle>{isNew ? t("components.newCustom") : `${c!.code} — ${c!.nameNl ?? c!.name}`}</CardTitle><CardDescription>{t("components.configSub")}</CardDescription></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <F name="code" label={t("components.f.code")}><Input id="code" name="code" defaultValue={c?.code} readOnly={!isNew} className={!isNew ? "bg-muted" : ""} /></F>
            <F name="nameNl" label={t("components.f.nameNl")}><Input id="nameNl" name="nameNl" defaultValue={c?.nameNl ?? c?.name} /></F>
            <F name="nameEn" label={t("components.f.nameEn")}><Input id="nameEn" name="nameEn" defaultValue={c?.nameEn ?? c?.name} /></F>
            <F name="category" label={t("components.f.category")} hint={t("components.f.categoryHint")}><Select id="category" name="category" defaultValue={category}>{CATEGORIES.map((v) => <option key={v} value={v}>{t(`components.category.${v}`)}</option>)}</Select></F>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("components.calculationTitle")}</CardTitle><CardDescription>{t("components.calculationSub")}</CardDescription></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <F name="calcType" label={t("components.f.method")}><Select id="calcType" name="calcType" defaultValue={c?.calcType ?? "FIXED"}>{METHODS.map((v) => <option key={v} value={v}>{t(`components.calc.${v}`)}</option>)}</Select></F>
            <F name="defaultAmount" label={t("components.f.defaultAmount")} hint={t("components.f.defaultAmountHint")}><Input id="defaultAmount" name="defaultAmount" defaultValue={f.input(c?.defaultAmount)} inputMode="decimal" /></F>
            <F name="currency" label={t("components.f.currency")}><CurrencySelect id="currency" name="currency" currencies={currencies} defaultValue={c?.currency ?? ""} emptyLabel={t("employee.sameAsSalary")} /></F>
            <F name="frequency" label={t("components.f.frequency")}><Select id="frequency" name="frequency" defaultValue={c?.frequency ?? "RECURRING"}>{(["RECURRING", "ONE_OFF", "ANNUAL"] as const).map((v) => <option key={v} value={v}>{t(`components.freq.${v}`)}</option>)}</Select></F>
            <F name="defaultRatePct" label={t("components.f.percentage")} hint={t("components.f.percentageHint")}><Input id="defaultRatePct" name="defaultRatePct" defaultValue={c?.defaultRateBp ? f.number(c.defaultRateBp / 100) : ""} inputMode="decimal" /></F>
            <F name="baseComponentCode" label={t("components.f.baseComponent")}><Select id="baseComponentCode" name="baseComponentCode" defaultValue={c?.baseComponentCode ?? ""}><option value="">—</option>{others.filter((o) => o.code !== c?.code).map((o) => <option key={o.code}>{o.code}</option>)}</Select></F>
            <F name="multiplierPct" label={t("components.f.multiplier")} hint={t("components.f.multiplierHint")}><Input id="multiplierPct" name="multiplierPct" defaultValue={f.number((c?.multiplierBp ?? 10000) / 100)} inputMode="decimal" /></F>
            <F name="unitPrice" label={t("components.f.unitPrice")}><Input id="unitPrice" name="unitPrice" defaultValue={f.input(c?.unitPrice)} inputMode="decimal" /></F>
            <F name="formula" label={t("components.f.formula")} hint={t("components.f.formulaHint")} className="sm:col-span-2 lg:col-span-4"><Input id="formula" name="formula" defaultValue={c?.formula ?? ""} placeholder="MIN(BASE * 0.05, 500)" className="font-mono" /></F>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("components.treatmentTitle")}</CardTitle><CardDescription>{t("components.treatmentSub")}</CardDescription></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <F name="taxTreatment" label={t("components.f.tax")} hint={t("components.f.taxHint")}><Select id="taxTreatment" name="taxTreatment" defaultValue={c?.taxTreatment ?? "TAXABLE"}>{TREATMENTS.map((v) => <option key={v} value={v}>{t(`enums.taxTreatment.${v}`)}</option>)}</Select></F>
            <F name="exemptLimit" label={t("settings.components.limit")}><Input id="exemptLimit" name="exemptLimit" defaultValue={f.input(c?.exemptLimit)} /></F>
            <div className="space-y-2 pt-6 text-sm lg:col-span-2">
              <label className="flex items-center gap-2"><input type="checkbox" name="aovIncluded" defaultChecked={c?.aovIncluded ?? true} /> {t("components.f.aov")}</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="pensionIncluded" defaultChecked={c?.pensionIncluded ?? false} /> {t("components.f.pension")}</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="preTax" defaultChecked={c?.preTax ?? false} /> {t("components.f.preTax")}</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="benefitInKind" defaultChecked={c?.kind === "ALLOWANCE" && c?.netEffect === "NONE"} /> {t("components.f.benefitInKind")}</label>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">{t("components.derivedTreatment")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("components.adminTitle")}</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <F name="glAccount" label={t("components.f.gl")}><Input id="glAccount" name="glAccount" defaultValue={c?.glAccount ?? ""} /></F>
            <F name="effectiveFrom" label={t("components.f.effectiveFrom")}><Input id="effectiveFrom" name="effectiveFrom" type="date" defaultValue={toDateInput(c?.effectiveFrom)} /></F>
            <F name="effectiveTo" label={t("components.f.effectiveTo")}><Input id="effectiveTo" name="effectiveTo" type="date" defaultValue={toDateInput(c?.effectiveTo)} /></F>
            <F name="approvalStatus" label={t("components.f.approval")}><Select id="approvalStatus" name="approvalStatus" defaultValue={c?.approvalStatus ?? "DRAFT"}><option value="DRAFT">{t("components.draft")}</option><option value="APPROVED">{t("components.approved")}</option></Select></F>
            <F name="legalStatus" label={t("components.f.legalStatus")}><Select id="legalStatus" name="legalStatus" defaultValue={c?.legalStatus ?? "COMPANY_POLICY"}>{(["COMPANY_POLICY", "PENDING_VERIFICATION", "CONFLICT", "VERIFIED"] as const).map((v) => <option key={v} value={v}>{t(`legal.${v}`)}</option>)}</Select></F>
            <F name="legalReference" label={t("components.f.legalReference")} className="sm:col-span-2"><Textarea id="legalReference" name="legalReference" rows={2} defaultValue={c?.legalReference ?? ""} /></F>
            <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" name="isActive" defaultChecked={c?.isActive ?? true} /> {t("components.f.active")}</label>
            <label className="flex items-start gap-2 pt-6 text-sm sm:col-span-2"><input type="checkbox" name="availableToAll" className="mt-0.5" defaultChecked={c?.availableToAll ?? true} /> <span>{t("components.f.availableToAll")}<span className="block text-xs text-muted-foreground">{t("components.f.availableToAllHint")}</span></span></label>
            <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">{t("components.companyScope", { company: ctx.company.name })}</p>
          </CardContent>
        </Card>
        <div className="flex justify-end"><SubmitButton>{isNew ? t("common.create") : t("common.saveChanges")}</SubmitButton></div>
      </ActionForm>
      {c && bulkOption && (
        <Card data-testid="bulk-assign">
          <CardHeader><CardTitle>{t("components.bulkTitle")}</CardTitle><CardDescription>{t("components.bulkSub")}</CardDescription></CardHeader>
          <CardContent>
            <ComponentAssignmentForm
              action={bulkAssignAction} mode="bulk" kind={c.kind} options={[]} fixedOption={bulkOption} hidden={{}}
              currencies={currencies} defaultCurrency={ctx.company.currency} baseOptions={baseOptions} employees={employees}
              today={toDateInput(new Date())} idPrefix="bulk" submitLabel={t("components.bulkSubmit")}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
