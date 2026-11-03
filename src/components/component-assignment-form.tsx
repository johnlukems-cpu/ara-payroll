"use client";

import * as React from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ActionState } from "@/lib/server/action";
import type { ComponentOption } from "@/lib/server/pay-components";
import { ActionForm, FieldError } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { CurrencySelect, type CurrencyOption } from "@/components/currency-select";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/utils";

type Action = (state: ActionState, fd: FormData) => Promise<ActionState>;

/** Values of an existing fixed component (edit mode). */
export type AssignmentInitial = {
  id: string;
  label: string;
  calcType: string; // "COMPONENT" = component default
  amount: string;
  currency: string;
  rate: string;
  baseComponentCode: string;
  quantity: string;
  frequency: string;
  payMonth: string;
  startDate: string;
  endDate: string;
  tax: string; // CONFIG | TAXABLE | EXEMPT
  aovIncluded: boolean;
  pensionIncluded: boolean;
  isActive: boolean;
  note: string;
};

const QTY = new Set(["HOURS_X_RATE", "DAYS_X_RATE", "QTY_X_PRICE"]);
const FOUR = new Set(["FIXED", "PERCENT_OF_BASE", "PERCENT_OF_COMPONENT", "MANUAL"]);
const FREQUENCIES = ["MONTHLY", "PER_PERIOD", "ONE_OFF", "ANNUAL", "ACCRUAL"] as const;
const minorToInput = (v: number) => (v ? (v / 100).toFixed(2) : "");

/**
 * Form for allowances/deductions. mode "fixed": a fixed component of an employee (all settings incl. frequency
 * and validity); "bulk": the same for several employees; "incidental": an extra component on payslips of one run.
 * The detail fields only appear after a component has been selected, prefilled with the component's defaults.
 */
export function ComponentAssignmentForm(props: {
  action: Action;
  mode: "fixed" | "bulk" | "incidental";
  kind: "ALLOWANCE" | "DEDUCTION" | "EMPLOYER";
  options: ComponentOption[];
  hidden: Record<string, string>;
  currencies: CurrencyOption[];
  defaultCurrency: string;
  baseOptions: { code: string; name: string }[];
  employees?: { id: string; name: string }[];
  /** Fixed: a preselected component (edit mode or bulk assignment of one component). */
  fixedOption?: ComponentOption;
  initial?: AssignmentInitial;
  today: string;
  idPrefix: string;
  submitLabel?: string;
  /** Contribution schemes of the company (employee shares are listed in the deductions dropdown). */
  schemes?: { type: string; name: string; active: boolean }[];
  canManageSchemes?: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const { mode, kind, initial, idPrefix: p } = props;
  const [value, setValue] = React.useState(props.fixedOption?.value ?? "");
  const opt = props.fixedOption ?? props.options.find((o) => o.value === value);
  const [calc, setCalc] = React.useState(initial?.calcType ?? "COMPONENT");
  const [freq, setFreq] = React.useState(initial?.frequency ?? opt?.frequency ?? "MONTHLY");
  const [tax, setTax] = React.useState(initial?.tax ?? "CONFIG");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [aov, setAov] = React.useState<boolean | null>(null);

  const select = (v: string) => {
    setValue(v);
    const o = props.options.find((x) => x.value === v);
    setCalc(o && FOUR.has(o.calcType) ? o.calcType : "COMPONENT");
    setFreq(o?.frequency ?? "MONTHLY");
    setTax("CONFIG");
    setAov(null);
  };
  const effectiveCalc = calc === "COMPONENT" ? opt?.calcType ?? "FIXED" : calc;
  const months = React.useMemo(() => Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, i, 1)))), [locale]);
  const choices = props.options.filter((o) => o.kind === kind);
  const placeholder = t(`assign.placeholder.${kind}`);
  const schemeType = value.startsWith("scheme:") ? (value.slice(7) as "HEALTH" | "PENSION" | "FVO") : null;
  const scheme = schemeType ? props.schemes?.find((x) => x.type === schemeType && x.active) ?? props.schemes?.find((x) => x.type === schemeType) : undefined;

  return (
    <ActionForm action={props.action} className="space-y-4" resetOnSuccess={!initial} notify={initial ? "toast" : "inline"}>
      {Object.entries(props.hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {initial && <input type="hidden" name="id" value={initial.id} />}
      {props.fixedOption && <input type="hidden" name="component" value={props.fixedOption.value} />}
      {mode !== "incidental" && <input type="hidden" name="activeField" value="1" />}

      {!props.fixedOption && (
        <Field label={t(`assign.select.${kind}`)} htmlFor={`${p}-component`}>
          <Select id={`${p}-component`} name="component" value={value} onChange={(e) => select(e.target.value)} data-testid={`${p}-component`}>
            <option value="">{placeholder}</option>
            {kind === "ALLOWANCE" && <option value="statutory:BASE" disabled>{t("assign.statutory.BASE")}</option>}
            {kind === "DEDUCTION" && (["LB", "AOV"] as const).map((c) => <option key={c} value={`statutory:${c}`} disabled>{t(`assign.statutory.${c}`)}</option>)}
            {kind === "DEDUCTION" && (["HEALTH", "PENSION", "FVO"] as const).map((c) => (
              <option key={c} value={`scheme:${c}`} disabled={mode === "incidental"}>{t(`assign.scheme.${c}`)}{mode === "incidental" ? ` ${t("assign.viaScheme")}` : ""}</option>
            ))}
            {choices.map((o) => <option key={o.value} value={o.value}>{o.name}</option>)}
          </Select>
          <FieldError name="component" />
        </Field>
      )}

      {schemeType && (
        <div className="rounded-lg border bg-muted/30 p-4 text-sm" data-testid={`${p}-scheme-info`}>
          <p>{scheme ? t(scheme.active ? "assign.schemeInfo" : "assign.schemeInactive", { name: scheme.name }) : t("assign.schemeMissing")}</p>
          <p className="mt-2 flex flex-wrap gap-4">
            <a href="#contributions" className="text-primary hover:underline">{t("assign.schemeManageEmployee")}</a>
            {props.canManageSchemes && <Link href="/app/settings/contributions" className="text-primary hover:underline">{t("assign.schemeManageSettings")}</Link>}
          </p>
        </div>
      )}

      {opt && (
        <div key={opt.value} className="grid gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {(opt.legalStatus !== "VERIFIED" && opt.legalStatus !== "COMPANY_POLICY") && (
            <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs sm:col-span-2 lg:col-span-4">{t("assign.legalPending", { reference: opt.legalReference ?? "—" })}</p>
          )}
          {(mode === "bulk" || (mode === "incidental" && props.employees)) && props.employees && (
            <div className="sm:col-span-2 lg:col-span-4">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-sm font-medium">{t("assign.f.employees")}</span>
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => setSelected(selected.length === props.employees!.length ? [] : props.employees!.map((e) => e.id))}>
                  {selected.length === props.employees.length ? t("assign.selectNone") : t("assign.selectAll")}
                </button>
              </div>
              <div className="grid max-h-40 gap-1 overflow-y-auto rounded-lg border bg-card p-2 sm:grid-cols-2 lg:grid-cols-3">
                {props.employees.map((e) => (
                  <label key={e.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="employeeIds" value={e.id} checked={selected.includes(e.id)} onChange={(ev) => setSelected(ev.target.checked ? [...selected, e.id] : selected.filter((x) => x !== e.id))} />
                    {e.name}
                  </label>
                ))}
              </div>
              <FieldError name="employeeIds" />
            </div>
          )}
          <Field label={t("assign.f.name")} htmlFor={`${p}-label`} className="lg:col-span-2">
            <Input id={`${p}-label`} name={mode === "incidental" ? "description" : "label"} defaultValue={initial?.label ?? opt.name} maxLength={80} />
          </Field>
          <Field label={t("assign.f.calcType")} htmlFor={`${p}-calc`} className="lg:col-span-2">
            <Select id={`${p}-calc`} name="calcType" value={calc} onChange={(e) => setCalc(e.target.value)}>
              {!FOUR.has(opt.calcType) && <option value="COMPONENT">{t("assign.calc.COMPONENT", { method: t(`enums.calcType.${opt.calcType}` as never) })}</option>}
              <option value="FIXED">{t("assign.calc.FIXED")}</option>
              <option value="PERCENT_OF_BASE">{t("assign.calc.PERCENT_OF_BASE")}</option>
              <option value="PERCENT_OF_COMPONENT">{t("assign.calc.PERCENT_OF_COMPONENT")}</option>
              {mode !== "incidental" && <option value="MANUAL">{t("assign.calc.MANUAL")}</option>}
            </Select>
            <FieldError name="calcType" />
          </Field>
          {(effectiveCalc === "FIXED" || effectiveCalc === "MANUAL") && (
            <>
              <Field label={t("assign.f.amount")} htmlFor={`${p}-amount`} hint={effectiveCalc === "MANUAL" ? t("assign.hint.variable") : undefined}>
                <Input id={`${p}-amount`} name="amount" inputMode="decimal" defaultValue={initial?.amount ?? minorToInput(opt.defaultAmount)} />
                <FieldError name="amount" />
              </Field>
              <Field label={t("assign.f.currency")} htmlFor={`${p}-currency`}>
                <CurrencySelect id={`${p}-currency`} name="currency" currencies={props.currencies} defaultValue={initial?.currency || opt.currency || props.defaultCurrency} />
                <FieldError name="currency" />
              </Field>
            </>
          )}
          {(effectiveCalc === "PERCENT_OF_BASE" || effectiveCalc === "PERCENT_OF_COMPONENT") && (
            <Field label={t("assign.f.rate")} htmlFor={`${p}-rate`}>
              <Input id={`${p}-rate`} name="rate" inputMode="decimal" defaultValue={initial?.rate ?? opt.defaultRatePct} />
              <FieldError name="rate" />
            </Field>
          )}
          {effectiveCalc === "PERCENT_OF_COMPONENT" && (
            <Field label={t("assign.f.baseComponent")} htmlFor={`${p}-base`}>
              <Select id={`${p}-base`} name="baseComponentCode" defaultValue={initial?.baseComponentCode ?? ""}>
                <option value="">—</option>
                {props.baseOptions.filter((b) => b.code !== opt.code).map((b) => <option key={b.code} value={b.code}>{b.name} ({b.code})</option>)}
              </Select>
              <FieldError name="baseComponentCode" />
            </Field>
          )}
          {QTY.has(effectiveCalc) && (
            <Field label={t("assign.f.quantity")} htmlFor={`${p}-qty`}>
              <Input id={`${p}-qty`} name="quantity" inputMode="decimal" defaultValue={initial?.quantity ?? ""} />
              <FieldError name="quantity" />
            </Field>
          )}

          {mode !== "incidental" && (
            <>
              <Field label={t("assign.f.frequency")} htmlFor={`${p}-freq`} hint={`${t(`assign.hint.${freq}` as never)}${freq === "ANNUAL" && effectiveCalc === "PERCENT_OF_BASE" ? ` ${t("assign.hint.annualPercent")}` : ""}`} className="lg:col-span-2">
                <Select id={`${p}-freq`} name="frequency" value={freq} onChange={(e) => setFreq(e.target.value as typeof freq)}>
                  {FREQUENCIES.map((f) => <option key={f} value={f}>{t(`enums.assignmentFrequency.${f}`)}</option>)}
                </Select>
              </Field>
              {(freq === "ANNUAL" || freq === "ACCRUAL") && (
                <Field label={t("assign.f.payMonth")} htmlFor={`${p}-month`}>
                  <Select id={`${p}-month`} name="payMonth" defaultValue={initial?.payMonth ?? ""}>
                    <option value="">{freq === "ACCRUAL" ? t("assign.payMonthDefaultAccrual", { month: months[11] }) : t("assign.payMonthDefaultAnnual")}</option>
                    {months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </Select>
                </Field>
              )}
              <Field label={freq === "ONE_OFF" ? t("assign.f.paymentDate") : t("assign.f.startDate")} htmlFor={`${p}-start`}>
                <Input id={`${p}-start`} name="startDate" type="date" defaultValue={initial?.startDate ?? props.today} />
                <FieldError name="startDate" />
              </Field>
              {freq !== "ONE_OFF" && (
                <Field label={t("assign.f.endDate")} htmlFor={`${p}-end`}>
                  <Input id={`${p}-end`} name="endDate" type="date" defaultValue={initial?.endDate ?? ""} />
                  <FieldError name="endDate" />
                </Field>
              )}
            </>
          )}

          {opt.kind === "ALLOWANCE" && (
            <>
              <Field label={t("assign.f.tax")} htmlFor={`${p}-tax`} className="lg:col-span-2">
                <Select id={`${p}-tax`} name="tax" value={tax} onChange={(e) => setTax(e.target.value)}>
                  <option value="CONFIG">{t("assign.tax.CONFIG", { treatment: t(`enums.taxTreatment.${opt.taxTreatment}` as never) })}</option>
                  <option value="TAXABLE">{t("assign.tax.TAXABLE")}</option>
                  {opt.category !== "BONUS" && opt.category !== "OVERTIME" && <option value="EXEMPT">{t("assign.tax.EXEMPT")}</option>}
                </Select>
                {tax === "EXEMPT" && <p className="text-xs text-warning">{t("assign.exemptWarning")}</p>}
                <FieldError name="tax" />
              </Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input type="checkbox" name="aovIncluded" checked={aov ?? initial?.aovIncluded ?? opt.aovIncluded} onChange={(e) => setAov(e.target.checked)} /> {t("assign.f.aov")}
              </label>
              {!(aov ?? initial?.aovIncluded ?? opt.aovIncluded) && tax !== "EXEMPT" && (
                <p className="text-xs text-warning sm:col-span-2 lg:col-span-4">{t("assign.aovExcludedWarning")}</p>
              )}
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input type="checkbox" name="pensionIncluded" defaultChecked={initial?.pensionIncluded ?? opt.pensionIncluded} /> {t("assign.f.pension")}
              </label>
            </>
          )}

          {mode !== "incidental" ? (
            <>
              <Field label={t("assign.f.note")} htmlFor={`${p}-note`} className="sm:col-span-2 lg:col-span-3">
                <Textarea id={`${p}-note`} name="note" rows={2} defaultValue={initial?.note ?? ""} maxLength={500} className="min-h-10" />
              </Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input type="checkbox" name="isActive" defaultChecked={initial?.isActive ?? true} /> {t("assign.f.active")}
              </label>
            </>
          ) : (
            <label className={cn("flex items-start gap-2 text-sm sm:col-span-2 lg:col-span-4")}>
              <input type="checkbox" name="allowDuplicate" className="mt-1" /> {t("assign.f.allowDuplicate")}
            </label>
          )}
          <div className="flex justify-end sm:col-span-2 lg:col-span-4">
            <SubmitButton>{props.submitLabel ?? (initial ? t("common.save") : t("common.add"))}</SubmitButton>
          </div>
        </div>
      )}
    </ActionForm>
  );
}
