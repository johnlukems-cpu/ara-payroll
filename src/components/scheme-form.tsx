"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ActionForm, FieldError } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { CurrencySelect, type CurrencyOption } from "@/components/currency-select";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { saveSchemeAction } from "@/app/actions/contributions";

export type SchemeValues = {
  id?: string;
  type: "HEALTH" | "PENSION" | "FVO";
  name: string;
  basis: string;
  method: string;
  base: string;
  employeeRate: string;
  employerRate: string;
  employeeAmount: string;
  employerAmount: string;
  maxBase: string;
  minBase: string;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string;
  isActive: boolean;
  approved: boolean;
  appliesToAll: boolean;
  employeeTax: string;
  showOnPayslip: boolean;
  legalStatus: string;
  legalReference: string;
  notes: string;
};

function F({ name, label, hint, children, className }: { name: string; label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return <Field label={label} htmlFor={name} hint={hint} className={className}>{children}<FieldError name={name} /></Field>;
}

/** Contribution scheme settings: employee and employer share side by side, base, validity, tax treatment and payslip display. */
export function SchemeForm({ v, currencies, canVerify }: { v: SchemeValues; currencies: CurrencyOption[]; canVerify: boolean }) {
  const t = useTranslations();
  const [method, setMethod] = React.useState(v.method);
  const [basis, setBasis] = React.useState(v.basis);
  return (
    <ActionForm action={saveSchemeAction} className="space-y-6" notify={v.id ? "toast" : "inline"}>
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <input type="hidden" name="type" value={v.type} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <F name="name" label={t("contrib.f.name")} className="sm:col-span-2"><Input id="name" name="name" defaultValue={v.name} maxLength={80} /></F>
        <F name="basis" label={t("contrib.f.basis")} hint={t(`contrib.basisHint.${basis}` as never)}>
          <Select id="basis" name="basis" value={basis} onChange={(e) => setBasis(e.target.value)}>
            <option value="STATUTORY">{t("enums.contributionBasis.STATUTORY")}</option>
            <option value="VOLUNTARY">{t("enums.contributionBasis.VOLUNTARY")}</option>
          </Select>
        </F>
        <F name="method" label={t("contrib.f.method")}>
          <Select id="method" name="method" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="PERCENTAGE">{t("enums.contributionMethod.PERCENTAGE")}</option>
            <option value="FIXED">{t("enums.contributionMethod.FIXED")}</option>
          </Select>
        </F>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {(["employee", "employer"] as const).map((side) => (
          <div key={side} className="rounded-lg border p-4" data-testid={`share-${side}`}>
            <p className="mb-1 text-sm font-semibold">{t(`contrib.${side}Share`)}</p>
            <p className="mb-3 text-xs text-muted-foreground">{t(`contrib.${side}ShareHint`)}</p>
            {method === "PERCENTAGE" ? (
              <F name={`${side}Rate`} label={t(`contrib.f.${side}Rate`)}><Input id={`${side}Rate`} name={`${side}Rate`} inputMode="decimal" defaultValue={side === "employee" ? v.employeeRate : v.employerRate} placeholder="0" /></F>
            ) : (
              <F name={`${side}Amount`} label={t(`contrib.f.${side}Amount`)}><Input id={`${side}Amount`} name={`${side}Amount`} inputMode="decimal" defaultValue={side === "employee" ? v.employeeAmount : v.employerAmount} placeholder="0,00" /></F>
            )}
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {method === "PERCENTAGE" && (
          <>
            <F name="base" label={t("contrib.f.base")} className="lg:col-span-2">
              <Select id="base" name="base" defaultValue={v.base}>
                {(["BASE_SALARY", "PENSION_BASE", "REGULAR_WAGE", "GROSS_WAGE"] as const).map((b) => <option key={b} value={b}>{t(`enums.contributionBase.${b}`)}</option>)}
              </Select>
            </F>
            <F name="minBase" label={t("contrib.f.minBase")} hint={t("contrib.f.minBaseHint")}><Input id="minBase" name="minBase" inputMode="decimal" defaultValue={v.minBase} /></F>
            <F name="maxBase" label={t("contrib.f.maxBase")} hint={t("contrib.f.maxBaseHint")}><Input id="maxBase" name="maxBase" inputMode="decimal" defaultValue={v.maxBase} /></F>
          </>
        )}
        {method === "FIXED" && <input type="hidden" name="base" value={v.base} />}
        <F name="currency" label={t("contrib.f.currency")} hint={t("contrib.f.currencyHint")}><CurrencySelect id="currency" name="currency" currencies={currencies} defaultValue={v.currency} /></F>
        <F name="effectiveFrom" label={t("contrib.f.effectiveFrom")}><Input id="effectiveFrom" name="effectiveFrom" type="date" defaultValue={v.effectiveFrom} /></F>
        <F name="effectiveTo" label={t("contrib.f.effectiveTo")}><Input id="effectiveTo" name="effectiveTo" type="date" defaultValue={v.effectiveTo} /></F>
        <F name="employeeTax" label={t("contrib.f.employeeTax")} className="lg:col-span-2">
          <Select id="employeeTax" name="employeeTax" defaultValue={v.employeeTax}>
            <option value="AFTER_TAX">{t("enums.contributionTax.AFTER_TAX")}</option>
            <option value="PRE_TAX">{t("enums.contributionTax.PRE_TAX")}</option>
          </Select>
        </F>
        <F name="legalStatus" label={t("components.f.legalStatus")}>
          <Select id="legalStatus" name="legalStatus" defaultValue={v.legalStatus}>
            {(["COMPANY_POLICY", "PENDING_VERIFICATION", "PARTIALLY_VERIFIED", "CONFLICT", ...(canVerify || v.legalStatus === "VERIFIED" ? ["VERIFIED"] : [])] as const).map((s) => <option key={s} value={s}>{t(`legal.${s}` as never)}</option>)}
          </Select>
        </F>
        <F name="legalReference" label={t("components.f.legalReference")} className="sm:col-span-2 lg:col-span-4"><Input id="legalReference" name="legalReference" defaultValue={v.legalReference} maxLength={600} /></F>
        <div className="space-y-2 text-sm sm:col-span-2">
          <label className="flex items-start gap-2"><input type="checkbox" name="appliesToAll" defaultChecked={v.appliesToAll} className="mt-0.5" /> <span>{t("contrib.f.appliesToAll")}<span className="block text-xs text-muted-foreground">{t("contrib.f.appliesToAllHint")}</span></span></label>
          <label className="flex items-start gap-2"><input type="checkbox" name="showOnPayslip" defaultChecked={v.showOnPayslip} className="mt-0.5" /> <span>{t("contrib.f.showOnPayslip")}<span className="block text-xs text-muted-foreground">{t("contrib.f.showOnPayslipHint")}</span></span></label>
        </div>
        <F name="notes" label={t("contrib.f.notes")} className="sm:col-span-2"><Textarea id="notes" name="notes" rows={3} defaultValue={v.notes} maxLength={500} /></F>
      </div>
      {basis === "STATUTORY" && <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">{t("contrib.statutoryWarning")}</p>}
      {v.id && v.approved && <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs">{t("contrib.changeResetsApproval")}</p>}
      <div className="flex justify-end"><SubmitButton>{v.id ? t("common.saveChanges") : t("common.create")}</SubmitButton></div>
    </ActionForm>
  );
}
