import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { getCurrencies } from "@/lib/server/rates";
import { can } from "@/lib/permissions";
import { eligibleEmployeesWhere } from "@/lib/payroll/service";
import { ActionForm, FieldError } from "@/components/action-form";
import { ActionButton } from "@/components/confirm-button";
import { SubmitButton } from "@/components/submit-button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { CurrencySelect } from "@/components/currency-select";
import { Alert, EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  addAdjustmentAction, approveRunAction, calculateRunAction, deleteRunAction, markPaidAction,
  reopenRunAction, removeAdjustmentAction, saveInputsAction,
} from "@/app/actions/payroll";

const STEPS = ["DRAFT", "CALCULATED", "APPROVED", "PAID"] as const;
const NOTICES = ["approved", "reopened", "paid"] as const;

export default async function RunPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> }) {
  const ctx = await requirePage("payroll.view");
  const { t, f } = await getI18n();
  const { id } = await params;
  const noticeKey = (await searchParams).notice;
  const notice = (NOTICES as readonly string[]).includes(noticeKey ?? "") ? t(`run.notices.${noticeKey as (typeof NOTICES)[number]}`) : null;
  const run = await db.payrollRun.findFirst({
    where: { id, companyId: ctx.company.id },
    include: { company: true, taxRuleSet: true, payslips: { orderBy: { employeeName: "asc" } }, adjustments: { include: { component: true } }, inputs: true },
  });
  if (!run) notFound();
  const editable = run.status === "DRAFT" || run.status === "CALCULATED";
  const canRun = can(ctx.role, "payroll.run");
  const canApprove = can(ctx.role, "payroll.approve");

  const employees = editable && canRun
    ? await db.employee.findMany({
        where: eligibleEmployeesWhere(ctx.company.id, run.year, run.month),
        include: { contracts: { orderBy: { startDate: "desc" }, take: 1 } },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      })
    : [];
  const components = editable && canRun ? await db.payComponent.findMany({ where: { companyId: ctx.company.id, isActive: true }, orderBy: [{ kind: "asc" }, { name: "asc" }] }) : [];
  const currencies = editable && canRun ? await getCurrencies() : [];
  const empName = new Map(employees.map((e) => [e.id, `${e.lastName}, ${e.firstName}`]));
  const stepIndex = STEPS.indexOf(run.status);
  const calcCur = run.payslips[0]?.calcCurrency ?? run.taxRuleSet?.currency ?? "SRD";
  const ot1 = f.pct(run.company.overtimeRate1Bp);
  const ot2 = f.pct(run.company.overtimeRate2Bp);

  return (
    <div>
      <PageHeader
        title={t("run.title", { period: f.period(run.year, run.month) })}
        description={[t("run.payDate", { date: f.date(run.payDate) }), run.taxRuleSet && t("run.rules", { name: run.taxRuleSet.name }), t("run.currencies", { calc: calcCur, base: run.currency })].filter(Boolean).join(" · ")}
        actions={
          <>
            {canRun && editable && <ActionButton action={calculateRunAction} fields={{ runId: run.id }} variant="accent">{run.status === "DRAFT" ? t("run.calculate") : t("run.recalculate")}</ActionButton>}
            {canApprove && run.status === "CALCULATED" && (
              <ActionForm notify="toast" action={approveRunAction} className="flex items-center gap-2">
                <input type="hidden" name="runId" value={run.id} />
                {run.legalStatus !== "VALIDATED" && <label className="flex max-w-56 items-start gap-1.5 text-xs"><input type="checkbox" name="acknowledgePending" className="mt-0.5" /> {t("run.acknowledge")}</label>}
                <SubmitButton>{t("run.approve")}</SubmitButton>
              </ActionForm>
            )}
            {canApprove && run.status === "APPROVED" && <ActionButton action={reopenRunAction} fields={{ runId: run.id }} variant="outline">{t("run.reopen")}</ActionButton>}
            {canApprove && run.status === "APPROVED" && <ActionButton action={markPaidAction} fields={{ runId: run.id }} confirm={t("run.markPaidConfirm")}>{t("run.markPaid")}</ActionButton>}
          </>
        }
      />

      <ol className="mb-6 grid grid-cols-4 gap-2 text-xs">
        {STEPS.map((s, i) => (
          <li key={s} className={`rounded-lg border px-3 py-2 ${i <= stepIndex ? "border-primary/30 bg-primary/5 font-medium text-primary" : "text-muted-foreground"}`}>
            {i + 1}. {t(`run.steps.${s}`)}
          </li>
        ))}
      </ol>

      {notice && <Alert variant="success" className="mb-4">{notice}</Alert>}
      {run.status !== "DRAFT" && run.legalStatus !== "VALIDATED" && run.payslips.length > 0 && (
        <Alert variant="warning" className="mb-4">{t("run.legalPending")} <Link href="/app/tax/rules" className="font-medium underline">{t("dashboard.reviewRules")}</Link>{run.legalAcknowledgedById && <> · {t("run.acknowledged")}</>}</Alert>
      )}
      {run.taxRuleSet && !run.taxRuleSet.isVerified && <Alert variant="warning" className="mb-4">{t("run.unverified")}</Alert>}
      {run.status === "DRAFT" && run.payslips.length > 0 && <Alert variant="info" className="mb-4">{t("run.inputsChanged")}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label={t("run.stats.employees")} value={run.employeeCount} />
        <Stat label={t("run.stats.gross")} value={f.money(run.totalGross, run.currency)} />
        <Stat label={t("run.stats.wageTax")} value={f.money(run.totalWageTax, run.currency)} />
        <Stat label={t("run.stats.aov")} value={f.money(run.totalAov, run.currency)} />
        <Stat label={t("run.stats.net")} value={f.money(run.totalNet, run.currency)} className="border-primary/30 bg-primary/[0.03]" />
      </div>

      {editable && canRun && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t("run.inputsTitle")}</CardTitle>
            <CardDescription>{t("run.inputsSub")}</CardDescription>
          </CardHeader>
          <ActionForm action={saveInputsAction}>
            <input type="hidden" name="runId" value={run.id} />
            <Table>
              <THead><TR><TH>{t("run.inputCols.employee")}</TH><TH>{t("run.inputCols.pay")}</TH><TH>{t("run.inputCols.hours")}</TH><TH>{t("run.inputCols.days")}</TH><TH>{t("run.inputCols.ot1", { pct: ot1 })}</TH><TH>{t("run.inputCols.ot2", { pct: ot2 })}</TH><TH>{t("run.inputCols.bonus")}</TH><TH>{t("run.inputCols.unpaid")}</TH></TR></THead>
              <TBody>
                {employees.map((e) => {
                  const i = run.inputs.find((x) => x.employeeId === e.id);
                  const c = e.contracts[0];
                  return (
                    <TR key={e.id}>
                      <TD className="whitespace-nowrap font-medium">{e.lastName}, {e.firstName}<span className="block text-xs font-normal text-muted-foreground">#{e.employeeNumber}</span></TD>
                      <TD className="whitespace-nowrap text-xs text-muted-foreground">{c ? (c.payType === "HOURLY" ? `${f.money(c.hourlyRate, c.salaryCurrency)}${t("common.perHour")}` : `${f.money(c.baseSalary, c.salaryCurrency)} ${t(`enums.frequency.${c.payType}`)}`) : <span className="text-destructive">{t("run.noContract")}</span>}</TD>
                      <TD><Input name={`hours_${e.id}`} defaultValue={i?.hoursWorked != null ? f.number(i.hoursWorked) : ""} disabled={c?.payType !== "HOURLY"} className="w-20" inputMode="decimal" aria-label={t("run.inputCols.hours")} /></TD>
                      <TD><Input name={`days_${e.id}`} defaultValue={i?.daysWorked != null ? f.number(i.daysWorked) : ""} disabled={c?.payType !== "DAILY"} className="w-20" inputMode="decimal" aria-label={t("run.inputCols.days")} /></TD>
                      <TD><Input name={`ot1_${e.id}`} defaultValue={i?.overtime1Hours ? f.number(i.overtime1Hours) : ""} className="w-20" inputMode="decimal" aria-label={t("run.inputCols.ot1", { pct: ot1 })} /></TD>
                      <TD><Input name={`ot2_${e.id}`} defaultValue={i?.overtime2Hours ? f.number(i.overtime2Hours) : ""} className="w-20" inputMode="decimal" aria-label={t("run.inputCols.ot2", { pct: ot2 })} /></TD>
                      <TD>
                        <div className="flex items-center gap-1">
                          <Input name={`bonus_${e.id}`} defaultValue={f.input(i?.bonus)} className="w-28" inputMode="decimal" aria-label={t("run.inputCols.bonus")} />
                          <span className="text-xs text-muted-foreground">{c?.salaryCurrency}</span>
                        </div>
                      </TD>
                      <TD><Input name={`unpaid_${e.id}`} defaultValue={i?.unpaidDays ? f.number(i.unpaidDays) : ""} disabled={c?.payType === "HOURLY" || c?.payType === "DAILY"} className="w-20" inputMode="decimal" aria-label={t("run.inputCols.unpaid")} /></TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            <div className="flex justify-end border-t p-4"><SubmitButton variant="outline">{t("run.saveInputs")}</SubmitButton></div>
          </ActionForm>
        </Card>
      )}

      {(run.adjustments.length > 0 || (editable && canRun)) && (
        <Card className="mt-6">
          <CardHeader><CardTitle>{t("run.adjTitle")}</CardTitle><CardDescription>{t("run.adjSub")}</CardDescription></CardHeader>
          {run.adjustments.length > 0 && (
            <Table>
              <THead><TR><TH>{t("run.adjCols.employee")}</TH><TH>{t("run.adjCols.component")}</TH><TH>{t("run.adjCols.description")}</TH><TH className="text-right">{t("run.adjCols.quantity")}</TH><TH className="text-right">{t("run.adjCols.amount")}</TH><TH /></TR></THead>
              <TBody>
                {run.adjustments.map((a) => {
                  const emp = employees.find((e) => e.id === a.employeeId);
                  const cur = a.currency ?? emp?.contracts[0]?.salaryCurrency ?? run.currency;
                  return (
                    <TR key={a.id}>
                      <TD>{empName.get(a.employeeId) ?? run.payslips.find((p) => p.employeeId === a.employeeId)?.employeeName ?? "—"}</TD>
                      <TD>{a.component.kind === "ALLOWANCE" ? "+" : "−"} {a.component.name}</TD>
                      <TD>{a.description ?? "—"}</TD>
                      <TD className="tabular text-right">{a.quantity != null ? f.number(a.quantity) : "—"}</TD>
                      <TD className="tabular text-right">{a.amount ? f.money(a.amount, cur) : "—"}</TD>
                      <TD className="text-right">{editable && canRun && <ActionButton action={removeAdjustmentAction} fields={{ id: a.id }} variant="ghost" size="sm">{t("common.remove")}</ActionButton>}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
          {editable && canRun && (
            <CardContent className="pt-4">
              <ActionForm action={addAdjustmentAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7" resetOnSuccess>
                <input type="hidden" name="runId" value={run.id} />
                <Field label={t("run.adjCols.employee")} htmlFor="adj-emp"><Select id="adj-emp" name="employeeId">{employees.map((e) => <option key={e.id} value={e.id}>{e.lastName}, {e.firstName}</option>)}</Select></Field>
                <Field label={t("run.adjCols.component")} htmlFor="adj-comp"><Select id="adj-comp" name="componentId">{components.filter((c) => c.approvalStatus === "APPROVED").map((c) => <option key={c.id} value={c.id}>{c.kind === "ALLOWANCE" ? "+" : c.kind === "DEDUCTION" ? "−" : "◦"} {c.code} {c.name}{["HOURS_X_RATE", "DAYS_X_RATE", "QTY_X_PRICE"].includes(c.calcType) ? ` (${t(`components.calc.${c.calcType}`)})` : ""}</option>)}</Select></Field>
                <Field label={t("run.adjCols.amount")} htmlFor="adj-amount"><Input id="adj-amount" name="amount" inputMode="decimal" /><FieldError name="amount" /></Field>
                <Field label={t("run.adjCols.quantity")} htmlFor="adj-qty" hint={t("run.quantityHint")}><Input id="adj-qty" name="quantity" inputMode="decimal" /></Field>
                <Field label={t("run.adjCols.currency")} htmlFor="adj-cur"><CurrencySelect id="adj-cur" name="currency" currencies={currencies} emptyLabel={t("employee.sameAsSalary")} defaultValue="" /></Field>
                <Field label={t("run.adjCols.description")} htmlFor="adj-desc"><Input id="adj-desc" name="description" /></Field>
                <div className="flex items-end"><SubmitButton variant="outline">{t("run.addAdjustment")}</SubmitButton></div>
              </ActionForm>
            </CardContent>
          )}
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between">
          <div><CardTitle>{t("run.payslipsTitle")}</CardTitle><CardDescription>{t("run.payslipsSub", { count: run.payslips.length, currency: calcCur })}</CardDescription></div>
          {run.payslips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <a href={`/api/payroll/${run.id}/payslips.pdf`} className={buttonVariants({ variant: "outline", size: "sm" })}><Download /> {t("run.allPdf")}</a>
              <a href={`/api/payroll/${run.id}/journal.csv`} className={buttonVariants({ variant: "outline", size: "sm" })}><Download /> {t("run.journal")}</a>
              {(run.status === "APPROVED" || run.status === "PAID") && <a href={`/api/payroll/${run.id}/bank.csv`} className={buttonVariants({ variant: "outline", size: "sm" })}><Download /> {t("run.bankFile")}</a>}
            </div>
          )}
        </CardHeader>
        {run.payslips.length === 0 ? (
          <EmptyState title={t("run.notCalculated")} description={t("run.notCalculatedText")} />
        ) : (
          <Table>
            <THead><TR><TH>{t("run.slipCols.employee")}</TH><TH className="text-right">{t("run.slipCols.gross")}</TH><TH className="text-right">{t("run.slipCols.wageTax")}</TH><TH className="text-right">{t("run.slipCols.aov")}</TH><TH className="text-right">{t("run.slipCols.deductions")}</TH><TH className="text-right">{t("run.slipCols.net")}</TH><TH className="text-right">{t("run.slipCols.netPaid")}</TH><TH className="text-right">{t("run.slipCols.employerCost")}</TH><TH /></TR></THead>
            <TBody>
              {run.payslips.map((p) => (
                <TR key={p.id}>
                  <TD className="font-medium">{p.employeeName}<span className="block text-xs font-normal text-muted-foreground">#{p.employeeNumber}</span></TD>
                  <TD className="tabular text-right">{f.amount(p.grossPay)}</TD>
                  <TD className="tabular text-right">{f.amount(p.wageTax)}</TD>
                  <TD className="tabular text-right">{f.amount(p.aov)}</TD>
                  <TD className="tabular text-right">{f.amount(p.totalDeductions)}</TD>
                  <TD className="tabular text-right font-semibold">{f.amount(p.netPay)}</TD>
                  <TD className="tabular whitespace-nowrap text-right">{f.money(p.netPayPayment, p.paymentCurrency)}</TD>
                  <TD className="tabular text-right text-muted-foreground">{f.amount(p.employerCost)}</TD>
                  <TD className="text-right"><Link href={`/app/payslips/${p.id}`} className="text-primary hover:underline">{t("common.view")}</Link></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {editable && canRun && (
        <div className="mt-8 flex justify-end">
          <ActionButton action={deleteRunAction} fields={{ runId: run.id }} variant="ghost" className="text-destructive" confirm={t("run.deleteConfirm")}>{t("run.deleteRun")}</ActionButton>
        </div>
      )}
    </div>
  );
}
