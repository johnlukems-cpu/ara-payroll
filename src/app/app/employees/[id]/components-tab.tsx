import type { Contract, EmployeePayComponent, PayComponent } from "@prisma/client";
import { db } from "@/lib/db";
import { getI18n } from "@/lib/server/i18n";
import { componentOptions, isStatutory, type ComponentOption } from "@/lib/server/pay-components";
import { scheduleFor, type AccrualState } from "@/lib/payroll/schedule";
import { toDateInput } from "@/lib/format";
import { ActionButton } from "@/components/confirm-button";
import { ComponentAssignmentForm, type AssignmentInitial } from "@/components/component-assignment-form";
import type { CurrencyOption } from "@/components/currency-select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { removeComponentAction, saveAssignmentAction } from "@/app/actions/employees";

type Assignment = EmployeePayComponent & { component: PayComponent };
type I18n = Awaited<ReturnType<typeof getI18n>>;

const fixed2 = (v: number) => (v / 100).toFixed(2);

/** Form values of an existing fixed component. */
function toInitial(a: Assignment): AssignmentInitial {
  return {
    id: a.id,
    label: a.label ?? a.component.name,
    calcType: a.calcType ?? (["FIXED", "PERCENT_OF_BASE", "PERCENT_OF_COMPONENT", "MANUAL"].includes(a.component.calcType) ? a.component.calcType : "COMPONENT"),
    amount: a.amount ? fixed2(a.amount) : "",
    currency: a.currency ?? "",
    rate: a.rateBp ? String(a.rateBp / 100) : "",
    baseComponentCode: a.baseComponentCode ?? a.component.baseComponentCode ?? "",
    quantity: a.quantity != null ? String(a.quantity) : "",
    frequency: a.frequency,
    payMonth: a.payMonth ? String(a.payMonth) : "",
    startDate: toDateInput(a.startDate),
    endDate: a.endDate ? toDateInput(a.endDate) : "",
    tax: a.taxOverride === "TAXABLE" || a.taxOverride === "EXEMPT" ? a.taxOverride : "CONFIG",
    aovIncluded: a.aovIncluded ?? a.component.aovIncluded,
    pensionIncluded: a.pensionIncluded ?? a.component.pensionIncluded,
    isActive: a.isActive,
    note: a.note ?? "",
  };
}

export function describeCalc(a: { calcType: string | null; amount: number; currency: string | null; rateBp: number; baseComponentCode: string | null; quantity: number | null; component: PayComponent }, salaryCur: string, { t, f }: Pick<I18n, "t" | "f">) {
  const calc = a.calcType ?? a.component.calcType;
  const amount = a.amount || (calc === "FIXED" || calc === "MANUAL" ? a.component.defaultAmount : 0);
  const rate = a.rateBp || a.component.defaultRateBp;
  switch (calc) {
    case "FIXED": return f.money(amount, a.currency ?? a.component.currency ?? salaryCur);
    case "MANUAL": return t("assign.variableAmount", { amount: f.money(amount, a.currency ?? a.component.currency ?? salaryCur) });
    case "PERCENT_OF_BASE": return t("employee.ofBase", { pct: f.pct(rate) });
    case "PERCENT_OF_COMPONENT": return t("assign.ofComponent", { pct: f.pct(rate), code: a.baseComponentCode ?? a.component.baseComponentCode ?? "—" });
    default: return `${t(`enums.calcType.${calc}` as never)}${a.quantity != null ? ` × ${f.number(a.quantity)}` : ""}`;
  }
}

function TaxCell({ a, t }: { a: Assignment; t: I18n["t"] }) {
  if (a.component.kind !== "ALLOWANCE") return <span className="text-muted-foreground">—</span>;
  if (a.taxOverride === "EXEMPT") return <Badge variant="warning">{t("assign.tax.EXEMPT")}</Badge>;
  if (a.taxOverride === "TAXABLE") return <span>{t("assign.tax.TAXABLE")}</span>;
  return <span className="text-xs">{t("assign.taxConfigShort", { treatment: t(`enums.taxTreatment.${a.component.taxTreatment}`) })}</span>;
}

export async function EmployeeComponentsTab(props: {
  employeeId: string;
  companyId: string;
  assignments: Assignment[];
  contract: Contract | undefined;
  currencies: CurrencyOption[];
  salaryCur: string;
  canEdit: boolean;
}) {
  const i18n = await getI18n();
  const { t, f, locale } = i18n;
  const { assignments, salaryCur, canEdit } = props;
  const options = await componentOptions(props.companyId, locale);
  const companyComponents = await db.payComponent.findMany({ where: { companyId: props.companyId, isActive: true }, orderBy: { name: "asc" } });
  const baseOptions = companyComponents.filter((c) => !isStatutory(c)).map((c) => ({ code: c.code, name: (locale === "en" ? c.nameEn : c.nameNl) || c.name }));
  // Latest accrual balances (e.g. holiday allowance built up during the year).
  const lastSlip = await db.payslip.findFirst({ where: { employeeId: props.employeeId }, orderBy: [{ run: { year: "desc" } }, { run: { month: "desc" } }], select: { trace: true, calcCurrency: true, run: { select: { year: true, month: true } } } });
  const accruals = ((lastSlip?.trace as { accruals?: Record<string, AccrualState> } | null)?.accruals) ?? {};
  const now = new Date();
  const today = toDateInput(now);

  const status = (a: Assignment) => {
    if (!a.isActive) return <Badge variant="muted">{t("assign.status.inactive")}</Badge>;
    if (a.endDate && a.endDate < now && a.frequency !== "ONE_OFF") return <Badge variant="muted">{t("assign.status.ended")}</Badge>;
    if (a.frequency === "ONE_OFF" && scheduleFor(a, now.getUTCFullYear(), now.getUTCMonth() + 1) === "skip" && a.startDate < now) return <Badge variant="muted">{t("assign.status.paid")}</Badge>;
    if (a.startDate > now) return <Badge variant="accent">{t("assign.status.future")}</Badge>;
    return <Badge variant="success">{t("assign.status.active")}</Badge>;
  };

  const optionFor = (a: Assignment): ComponentOption => ({
    value: a.component.id, code: a.component.code, name: (locale === "en" ? a.component.nameEn : a.component.nameNl) || a.component.name,
    kind: a.component.kind, category: a.component.category, calcType: a.component.calcType, taxTreatment: a.component.taxTreatment,
    frequency: a.frequency, defaultAmount: a.component.defaultAmount, defaultRatePct: a.component.defaultRateBp ? String(a.component.defaultRateBp / 100) : "",
    currency: a.component.currency, aovIncluded: a.component.aovIncluded, pensionIncluded: a.component.pensionIncluded,
    legalStatus: a.component.legalStatus, legalReference: a.component.legalReference, fromLibrary: false,
  });

  const formProps = { currencies: props.currencies, defaultCurrency: salaryCur, baseOptions, today, options };

  const section = (kind: "ALLOWANCE" | "DEDUCTION" | "EMPLOYER", letter: string) => {
    const rows = assignments.filter((a) => a.component.kind === kind);
    const pensionBp = props.contract?.pensionEmployeeBp ?? 0;
    return (
      <Card key={kind} data-testid={`section-${kind}`}>
        <CardHeader>
          <CardTitle>{letter}. {t(`assign.section.${kind}`)}</CardTitle>
          <CardDescription>{t(`assign.sectionSub.${kind}`)}</CardDescription>
        </CardHeader>
        {rows.length === 0 && kind !== "DEDUCTION" ? <EmptyState title={t(`assign.empty.${kind}`)} /> : (
          <Table>
            <THead><TR>
              <TH>{t("assign.cols.component")}</TH><TH>{t("assign.cols.calculation")}</TH><TH>{t("assign.cols.frequency")}</TH>
              <TH>{t("assign.cols.validity")}</TH><TH>{t("assign.cols.tax")}</TH><TH>{t("assign.cols.status")}</TH><TH />
            </TR></THead>
            <TBody>
              {kind === "DEDUCTION" && (
                <>
                  {(["LB", "AOV"] as const).map((c) => (
                    <TR key={c} className="bg-muted/30">
                      <TD className="font-medium">{t(`assign.statutoryName.${c}`)}</TD>
                      <TD className="text-xs text-muted-foreground" colSpan={4}>{t("assign.statutoryAuto")}</TD>
                      <TD><Badge variant="accent">{t("assign.status.automatic")}</Badge></TD><TD />
                    </TR>
                  ))}
                  {pensionBp > 0 && (
                    <TR className="bg-muted/30">
                      <TD className="font-medium">{t("assign.statutoryName.PENS")}</TD>
                      <TD className="text-xs text-muted-foreground" colSpan={4}>{t("assign.pensionViaContract", { pct: f.pct(pensionBp) })}</TD>
                      <TD><Badge variant="accent">{t("assign.status.automatic")}</Badge></TD><TD />
                    </TR>
                  )}
                </>
              )}
              {rows.map((a) => (
                <TR key={a.id} data-testid={`assignment-${a.component.code}`}>
                  <TD className="align-top">
                    <p className="font-medium">{a.label ?? a.component.name}</p>
                    <p className="text-xs text-muted-foreground">{a.component.code}{a.note ? ` · ${a.note}` : ""}</p>
                    {a.frequency === "ACCRUAL" && lastSlip && accruals[a.id] && <p className="text-xs text-primary">{t("assign.accrued", { amount: f.money(accruals[a.id].balance, lastSlip.calcCurrency), period: f.period(lastSlip.run.year, lastSlip.run.month) })}</p>}
                    {canEdit && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-primary hover:underline">{t("common.edit")}</summary>
                        <div className="mt-3 min-w-[min(80vw,52rem)]">
                          <ComponentAssignmentForm action={saveAssignmentAction} mode="fixed" kind={kind} hidden={{ employeeId: props.employeeId }} fixedOption={optionFor(a)} initial={toInitial(a)} idPrefix={`edit-${a.id}`} {...formProps} />
                        </div>
                      </details>
                    )}
                  </TD>
                  <TD className="tabular align-top">{describeCalc(a, salaryCur, i18n)}</TD>
                  <TD className="align-top">
                    {t(`enums.assignmentFrequency.${a.frequency}`)}
                    {a.payMonth && <span className="block text-xs text-muted-foreground">{t("assign.inMonth", { month: f.month(a.payMonth) })}</span>}
                  </TD>
                  <TD className="tabular whitespace-nowrap align-top">{f.date(a.startDate)}{a.frequency !== "ONE_OFF" && ` – ${a.endDate ? f.date(a.endDate) : t("assign.openEnded")}`}</TD>
                  <TD className="align-top"><TaxCell a={a} t={t} /></TD>
                  <TD className="align-top">{status(a)}</TD>
                  <TD className="text-right align-top">
                    {canEdit && <ActionButton action={removeComponentAction} fields={{ id: a.id }} variant="ghost" size="sm" confirm={t("employee.removeComponentConfirm")}>{t("common.remove")}</ActionButton>}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        {canEdit && kind !== "EMPLOYER" && (
          <CardContent className="border-t pt-5">
            <p className="mb-3 text-sm font-medium">{t(`assign.addTitle.${kind}`)}</p>
            <ComponentAssignmentForm action={saveAssignmentAction} mode="fixed" kind={kind} hidden={{ employeeId: props.employeeId }} idPrefix={`add-${kind}`} {...formProps} />
          </CardContent>
        )}
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{t("assign.intro")}</p>
      {section("ALLOWANCE", "A")}
      {section("DEDUCTION", "B")}
      {assignments.some((a) => a.component.kind === "EMPLOYER") && section("EMPLOYER", "C")}
    </div>
  );
}
