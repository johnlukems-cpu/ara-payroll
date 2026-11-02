import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import type { EmployeePayComponent, PayComponent } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { getCurrencies } from "@/lib/server/rates";
import { can } from "@/lib/permissions";
import { periodBounds } from "@/lib/payroll/service";
import { scheduleFor, type ScheduleDecision } from "@/lib/payroll/schedule";
import { payslipSummary, SUMMARY_ROWS } from "@/lib/payroll/summary";
import { componentOptions, isStatutory } from "@/lib/server/pay-components";
import { toDateInput } from "@/lib/format";
import { ActionForm } from "@/components/action-form";
import { ActionButton } from "@/components/confirm-button";
import { SubmitButton } from "@/components/submit-button";
import { ComponentAssignmentForm } from "@/components/component-assignment-form";
import { PayslipView } from "@/components/payslip-view";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { Alert, EmptyState, PageHeader } from "@/components/ui/misc";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { addAdjustmentAction, approveRunAction, calculateRunAction, overrideFixedAction, removeAdjustmentAction } from "@/app/actions/payroll";
import { describeCalc } from "@/app/app/employees/[id]/components-tab";

type Assignment = EmployeePayComponent & { component: PayComponent };
const DECISION_VARIANT: Record<ScheduleDecision, "success" | "accent" | "muted"> = { pay: "success", accrueAndPay: "success", accrue: "accent", skip: "muted" };

/**
 * Compose one employee's payslip within a run: salary data, fixed allowances and deductions (adjustable
 * for this payslip only), extra components via dropdowns, the calculation, a preview and finalisation.
 */
export default async function ComposePayslipPage({ params }: { params: Promise<{ id: string; employeeId: string }> }) {
  const ctx = await requirePage("payroll.view");
  const i18n = await getI18n();
  const { t, f, locale } = i18n;
  const { id, employeeId } = await params;
  const run = await db.payrollRun.findFirst({ where: { id, companyId: ctx.company.id }, include: { company: true } });
  if (!run) notFound();
  const { end } = periodBounds(run.year, run.month);
  const e = await db.employee.findFirst({
    where: { id: employeeId, companyId: ctx.company.id },
    include: {
      contracts: { where: { startDate: { lte: end } }, orderBy: { startDate: "desc" }, take: 1 },
      components: { include: { component: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!e) notFound();
  const [adjustments, slip, input] = await Promise.all([
    db.payrollAdjustment.findMany({ where: { runId: run.id, employeeId: e.id }, include: { component: true }, orderBy: { createdAt: "asc" } }),
    db.payslip.findFirst({ where: { runId: run.id, employeeId: e.id }, include: { lines: { orderBy: { sortOrder: "asc" } }, run: { include: { company: true } } } }),
    db.payrollInput.findUnique({ where: { runId_employeeId: { runId: run.id, employeeId: e.id } } }),
  ]);
  const editable = (run.status === "DRAFT" || run.status === "CALCULATED") && can(ctx.role, "payroll.run");
  const canApprove = can(ctx.role, "payroll.approve");
  const contract = e.contracts[0];
  const salaryCur = contract?.salaryCurrency ?? ctx.company.currency;
  const currencies = editable ? await getCurrencies() : [];
  const options = editable ? await componentOptions(ctx.company.id, locale) : [];
  const baseOptions = editable
    ? (await db.payComponent.findMany({ where: { companyId: ctx.company.id, isActive: true }, orderBy: { name: "asc" } })).filter((c) => !isStatutory(c)).map((c) => ({ code: c.code, name: (locale === "en" ? c.nameEn : c.nameNl) || c.name }))
    : [];
  const name = `${e.firstName} ${e.lastName}`;
  // Fixed components due in this period, plus annual ones within their validity (shown as "not in this period").
  const { start } = periodBounds(run.year, run.month);
  const relevant = e.components.filter((a) => a.isActive && (scheduleFor(a, run.year, run.month) !== "skip" || (a.frequency === "ANNUAL" && a.startDate <= end && (!a.endDate || a.endDate >= start))));
  const overrideOf = (a: Assignment) => adjustments.find((x) => x.assignmentId === a.id);
  const incidental = adjustments.filter((a) => !a.assignmentId);

  const fixedTable = (kind: "ALLOWANCE" | "DEDUCTION") => {
    const rows = relevant.filter((a) => a.component.kind === kind);
    const pensionBp = contract?.pensionEmployeeBp ?? 0;
    return (
      <Card data-testid={`compose-fixed-${kind}`}>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div><CardTitle>{t(`compose.fixed.${kind}`)}</CardTitle><CardDescription>{t("compose.fixedSub")}</CardDescription></div>
          <Link href={`/app/employees/${e.id}?tab=pay`} className="whitespace-nowrap text-sm text-primary hover:underline">{t("compose.manageFixed")}</Link>
        </CardHeader>
        <Table>
          <THead><TR><TH>{t("assign.cols.component")}</TH><TH>{t("assign.cols.calculation")}</TH><TH>{t("assign.cols.frequency")}</TH><TH>{t("compose.thisPeriod")}</TH><TH>{t("compose.adjust")}</TH></TR></THead>
          <TBody>
            {kind === "DEDUCTION" && (["LB", "AOV"] as const).map((c) => (
              <TR key={c} className="bg-muted/30"><TD className="font-medium">{t(`assign.statutoryName.${c}`)}</TD><TD colSpan={2} className="text-xs text-muted-foreground">{t("assign.statutoryAuto")}</TD><TD><Badge variant="accent">{t("assign.status.automatic")}</Badge></TD><TD /></TR>
            ))}
            {kind === "DEDUCTION" && pensionBp > 0 && (
              <TR className="bg-muted/30"><TD className="font-medium">{t("assign.statutoryName.PENS")}</TD><TD colSpan={2} className="text-xs text-muted-foreground">{t("assign.pensionViaContract", { pct: f.pct(pensionBp) })}</TD><TD><Badge variant="accent">{t("assign.status.automatic")}</Badge></TD><TD /></TR>
            )}
            {rows.length === 0 && kind === "ALLOWANCE" && <TR><TD colSpan={5} className="text-sm text-muted-foreground">{t("assign.empty.ALLOWANCE")}</TD></TR>}
            {rows.map((a) => {
              const decision = scheduleFor(a, run.year, run.month);
              const ov = overrideOf(a);
              return (
                <TR key={a.id} data-testid={`compose-row-${a.component.code}`}>
                  <TD className="font-medium">{a.label ?? a.component.name}<span className="block text-xs font-normal text-muted-foreground">{a.component.code}</span></TD>
                  <TD className="tabular">{describeCalc(a, salaryCur, i18n)}</TD>
                  <TD>{t(`enums.assignmentFrequency.${a.frequency}`)}</TD>
                  <TD><Badge variant={DECISION_VARIANT[decision]}>{t(`compose.decision.${decision}`)}</Badge></TD>
                  <TD>
                    {ov && <p className="mb-1 text-xs">{t("compose.overridden", { amount: f.money(ov.amount, ov.currency ?? salaryCur) })}</p>}
                    {editable && (decision === "pay" || decision === "accrueAndPay") && (
                      <div className="flex flex-wrap items-center gap-2">
                        <ActionForm action={overrideFixedAction} notify="toast" className="flex items-center gap-1">
                          <input type="hidden" name="runId" value={run.id} />
                          <input type="hidden" name="assignmentId" value={a.id} />
                          <Input name="amount" inputMode="decimal" className="h-8 w-36" aria-label={t("compose.overrideAmount")} defaultValue={ov ? (ov.amount / 100).toFixed(2) : ""} placeholder={t("compose.overridePlaceholder")} />
                          <span className="text-xs text-muted-foreground">{ov?.currency ?? a.currency ?? salaryCur}</span>
                          <SubmitButton size="sm" variant="outline">{t("compose.overrideSave")}</SubmitButton>
                        </ActionForm>
                        {ov && <ActionButton action={removeAdjustmentAction} fields={{ id: ov.id }} variant="ghost" size="sm">{t("compose.overrideReset")}</ActionButton>}
                      </div>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
    );
  };

  const extraCard = (kind: "ALLOWANCE" | "DEDUCTION") => {
    const rows = incidental.filter((a) => a.component.kind === kind);
    return (
      <Card data-testid={`compose-extra-${kind}`}>
        <CardHeader><CardTitle>{t(`compose.extra.${kind}`)}</CardTitle><CardDescription>{t(`compose.extraSub.${kind}`)}</CardDescription></CardHeader>
        {rows.length > 0 && (
          <Table>
            <TBody>
              {rows.map((a) => (
                <TR key={a.id}>
                  <TD className="font-medium">{a.description ?? a.component.name}{a.allowDuplicate && <Badge variant="warning" className="ml-2">{t("run.adjType.additional")}</Badge>}</TD>
                  <TD className="tabular text-right">{a.rateBp ? f.pct(a.rateBp) : a.quantity != null ? `${f.number(a.quantity)} ×` : f.money(a.amount, a.currency ?? salaryCur)}</TD>
                  <TD className="text-xs">{a.taxOverride ? t(`assign.tax.${a.taxOverride === "EXEMPT" ? "EXEMPT" : "TAXABLE"}`) : t("assign.taxConfigShort", { treatment: t(`enums.taxTreatment.${a.component.taxTreatment}`) })}</TD>
                  <TD className="text-right">{editable && <ActionButton action={removeAdjustmentAction} fields={{ id: a.id }} variant="ghost" size="sm">{t("common.remove")}</ActionButton>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        {editable && (
          <CardContent className={rows.length ? "border-t pt-5" : ""}>
            <ComponentAssignmentForm
              action={addAdjustmentAction} mode="incidental" kind={kind} options={options} hidden={{ runId: run.id, employeeId: e.id }}
              currencies={currencies} defaultCurrency={salaryCur} baseOptions={baseOptions} today={toDateInput(new Date())} idPrefix={`extra-${kind}`}
            />
          </CardContent>
        )}
      </Card>
    );
  };

  const summary = slip ? payslipSummary(slip, slip.lines) : null;

  return (
    <div className="space-y-6">
      <Link href={`/app/payroll/${run.id}`} className={buttonVariants({ variant: "ghost" })}><ArrowLeft /> {t("payslip.backToRun")}</Link>
      <PageHeader title={t("compose.title", { name })} description={`${f.period(run.year, run.month)} · #${e.employeeNumber}`} actions={<StatusBadge status={run.status} />} />
      {!editable && (run.status === "APPROVED" || run.status === "PAID") && <Alert variant="info">{t("compose.locked")}</Alert>}
      {run.status === "DRAFT" && slip && <Alert variant="info">{t("run.inputsChanged")}</Alert>}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">1. {t("compose.steps.salary")}</h2>
        <Card>
          {contract ? (
            <CardContent className="grid gap-4 pt-5 text-sm sm:grid-cols-3 lg:grid-cols-6">
              <div><p className="text-muted-foreground">{t("employee.contractCols.pay")}</p><p className="font-medium">{t(`enums.payType.${contract.payType}`)}</p></div>
              <div><p className="text-muted-foreground">{t("payslip.summary.baseSalary")}</p><p className="tabular font-medium">{contract.payType === "HOURLY" ? `${f.money(contract.hourlyRate, salaryCur)}${t("common.perHour")}` : f.money(contract.baseSalary, salaryCur)}</p></div>
              <div><p className="text-muted-foreground">{t("employee.contractCols.hours")}</p><p className="font-medium">{contract.hoursPerWeek}</p></div>
              <div><p className="text-muted-foreground">{t("employee.contractCols.pension")}</p><p className="font-medium">{f.pct(contract.pensionEmployeeBp)} / {f.pct(contract.pensionEmployerBp)}</p></div>
              <div><p className="text-muted-foreground">{t("compose.periodInputs")}</p><p className="text-xs">{t("compose.inputsLine", { ot1: f.number(input?.overtime1Hours ?? 0), ot2: f.number(input?.overtime2Hours ?? 0), unpaid: f.number(input?.unpaidDays ?? 0), bonus: f.money(input?.bonus ?? 0, salaryCur) })}</p></div>
              <div><p className="text-muted-foreground">{t("employee.paymentCurrency")}</p><p className="font-medium">{e.paymentCurrency ?? salaryCur}</p></div>
            </CardContent>
          ) : <EmptyState title={t("run.noContract")} />}
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">2–3. {t("compose.steps.fixed")}</h2>
        {fixedTable("ALLOWANCE")}
        {fixedTable("DEDUCTION")}
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">4–5. {t("compose.steps.extra")}</h2>
        <div className="grid gap-4 xl:grid-cols-2">
          {extraCard("ALLOWANCE")}
          {extraCard("DEDUCTION")}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">6. {t("compose.steps.calculation")}</h2>
        <Card data-testid="compose-calculation">
          {summary && slip ? (
            <Table>
              <TBody>
                {SUMMARY_ROWS.map((k) => (
                  <TR key={k} className={["grossPay", "totalDeductions", "totalPayable"].includes(k) ? "font-semibold" : ""}>
                    <TD>{t(`payslip.summary.${k}`)}</TD><TD className="tabular text-right">{f.money(summary[k], slip.calcCurrency)}</TD>
                  </TR>
                ))}
                {slip.paymentCurrency !== slip.calcCurrency && <TR><TD>{t("payslip.netPaidIn", { currency: slip.paymentCurrency })}</TD><TD className="tabular text-right">{f.money(slip.netPayPayment, slip.paymentCurrency)}</TD></TR>}
              </TBody>
            </Table>
          ) : <EmptyState title={t("run.notCalculated")} description={t("run.notCalculatedText")} />}
          {editable && (
            <CardContent className="flex justify-end border-t pt-4">
              <ActionButton action={calculateRunAction} fields={{ runId: run.id }} variant="accent">{t("run.recalculate")}</ActionButton>
            </CardContent>
          )}
        </Card>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">7. {t("compose.steps.preview")}</h2>
          {slip && <a href={`/api/payslips/${slip.id}/pdf`} className={buttonVariants({ variant: "outline", size: "sm" })}><Download /> {t("common.downloadPdf")}</a>}
        </div>
        {slip ? <PayslipView slip={slip} /> : <Card><EmptyState title={t("run.notCalculated")} /></Card>}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">8. {t("compose.steps.finalise")}</h2>
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5 text-sm">
            <p className="max-w-2xl text-muted-foreground">{t("compose.finaliseText")}</p>
            {canApprove && run.status === "CALCULATED" ? (
              <ActionForm notify="toast" action={approveRunAction} className="flex items-center gap-2">
                <input type="hidden" name="runId" value={run.id} />
                {run.legalStatus !== "VALIDATED" && <label className="flex max-w-56 items-start gap-1.5 text-xs"><input type="checkbox" name="acknowledgePending" className="mt-0.5" /> {t("run.acknowledge")}</label>}
                <SubmitButton>{t("run.approve")}</SubmitButton>
              </ActionForm>
            ) : <StatusBadge status={run.status} />}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
