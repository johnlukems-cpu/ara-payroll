import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { can } from "@/lib/permissions";
import { amount, date, money, periodLabel } from "@/lib/format";
import { eligibleEmployeesWhere } from "@/lib/payroll/service";
import { ActionForm, FieldError } from "@/components/action-form";
import { ActionButton } from "@/components/confirm-button";
import { SubmitButton } from "@/components/submit-button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert, EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  addAdjustmentAction, approveRunAction, calculateRunAction, deleteRunAction, markPaidAction,
  reopenRunAction, removeAdjustmentAction, saveInputsAction,
} from "@/app/actions/payroll";

const STEPS = ["DRAFT", "CALCULATED", "APPROVED", "PAID"] as const;

const NOTICES: Record<string, string> = {
  approved: "Payroll approved and locked. Payslips are now visible to employees.",
  reopened: "Payroll reopened. You can change inputs and recalculate.",
  paid: "Payroll marked as paid. This period is now permanently closed.",
};

export default async function RunPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> }) {
  const notice = NOTICES[(await searchParams).notice ?? ""];
  const ctx = await requirePage("payroll.view");
  const { id } = await params;
  const run = await db.payrollRun.findFirst({
    where: { id, companyId: ctx.company.id },
    include: { taxRuleSet: true, payslips: { orderBy: { employeeName: "asc" } }, adjustments: { include: { component: true } }, inputs: true },
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
  const empName = new Map(employees.map((e) => [e.id, `${e.lastName}, ${e.firstName}`]));
  const stepIndex = STEPS.indexOf(run.status);
  const totalDeductions = run.payslips.reduce((s, p) => s + p.totalDeductions, 0);

  return (
    <div>
      <PageHeader
        title={`Payroll ${periodLabel(run.year, run.month)}`}
        description={`Pay date ${date(run.payDate)}${run.taxRuleSet ? ` · Tax rules: ${run.taxRuleSet.name}` : ""}`}
        actions={
          <>
            {canRun && editable && <ActionButton action={calculateRunAction} fields={{ runId: run.id }} variant="accent">{run.status === "DRAFT" ? "Calculate payroll" : "Recalculate"}</ActionButton>}
            {canApprove && run.status === "CALCULATED" && <ActionButton action={approveRunAction} fields={{ runId: run.id }} confirm="Approve and lock this payroll run?">Approve</ActionButton>}
            {canApprove && run.status === "APPROVED" && <ActionButton action={reopenRunAction} fields={{ runId: run.id }} variant="outline">Reopen</ActionButton>}
            {canApprove && run.status === "APPROVED" && <ActionButton action={markPaidAction} fields={{ runId: run.id }} confirm="Confirm that salaries have been paid. This permanently closes the period.">Mark as paid</ActionButton>}
          </>
        }
      />

      <ol className="mb-6 grid grid-cols-4 gap-2 text-xs">
        {STEPS.map((s, i) => (
          <li key={s} className={`rounded-lg border px-3 py-2 ${i <= stepIndex ? "border-primary/30 bg-primary/5 font-medium text-primary" : "text-muted-foreground"}`}>
            {i + 1}. {s === "DRAFT" ? "Inputs" : s === "CALCULATED" ? "Calculated" : s === "APPROVED" ? "Approved" : "Paid"}
          </li>
        ))}
      </ol>

      {notice && <Alert variant="success" className="mb-4">{notice}</Alert>}
      {run.taxRuleSet && !run.taxRuleSet.isVerified && <Alert variant="warning" className="mb-4">Calculated with an unverified tax rule set. Verify the statutory rates under Settings → Tax rules before paying.</Alert>}
      {run.status === "DRAFT" && run.payslips.length > 0 && <Alert variant="info" className="mb-4">Inputs changed since the last calculation. Recalculate to update the payslips.</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Employees" value={run.employeeCount} />
        <Stat label="Gross pay" value={money(run.totalGross)} />
        <Stat label="Wage tax" value={money(run.totalWageTax)} />
        <Stat label="AOV" value={money(run.totalAov)} />
        <Stat label="Net pay" value={money(run.totalNet)} className="border-primary/30 bg-primary/[0.03]" />
      </div>

      {editable && canRun && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Period inputs</CardTitle>
            <CardDescription>Hours for hourly staff (leave empty to use contract hours), overtime, special rewards and unpaid days.</CardDescription>
          </CardHeader>
          <ActionForm action={saveInputsAction}>
            <input type="hidden" name="runId" value={run.id} />
            <Table>
              <THead><TR><TH>Employee</TH><TH>Pay</TH><TH>Hours worked</TH><TH>OT 150% (h)</TH><TH>OT 200% (h)</TH><TH>Bonus (SRD)</TH><TH>Unpaid days</TH></TR></THead>
              <TBody>
                {employees.map((e) => {
                  const i = run.inputs.find((x) => x.employeeId === e.id);
                  const c = e.contracts[0];
                  return (
                    <TR key={e.id}>
                      <TD className="font-medium whitespace-nowrap">{e.lastName}, {e.firstName}<span className="block text-xs font-normal text-muted-foreground">#{e.employeeNumber}</span></TD>
                      <TD className="text-xs text-muted-foreground">{c ? (c.payType === "MONTHLY" ? money(c.baseSalary) : `${money(c.hourlyRate)}/h`) : <span className="text-destructive">No contract</span>}</TD>
                      <TD><Input name={`hours_${e.id}`} defaultValue={i?.hoursWorked ?? ""} disabled={c?.payType !== "HOURLY"} className="w-24" inputMode="decimal" aria-label="Hours worked" /></TD>
                      <TD><Input name={`ot1_${e.id}`} defaultValue={i?.overtime1Hours || ""} className="w-20" inputMode="decimal" aria-label="Overtime 150%" /></TD>
                      <TD><Input name={`ot2_${e.id}`} defaultValue={i?.overtime2Hours || ""} className="w-20" inputMode="decimal" aria-label="Overtime 200%" /></TD>
                      <TD><Input name={`bonus_${e.id}`} defaultValue={i?.bonus ? amount(i.bonus) : ""} className="w-28" inputMode="decimal" aria-label="Bonus" /></TD>
                      <TD><Input name={`unpaid_${e.id}`} defaultValue={i?.unpaidDays || ""} disabled={c?.payType === "HOURLY"} className="w-20" inputMode="decimal" aria-label="Unpaid days" /></TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            <div className="flex justify-end border-t p-4"><SubmitButton variant="outline">Save inputs</SubmitButton></div>
          </ActionForm>
        </Card>
      )}

      {(run.adjustments.length > 0 || (editable && canRun)) && (
        <Card className="mt-6">
          <CardHeader><CardTitle>One-off adjustments</CardTitle><CardDescription>Allowances or deductions that apply to this period only.</CardDescription></CardHeader>
          {run.adjustments.length > 0 && (
            <Table>
              <THead><TR><TH>Employee</TH><TH>Component</TH><TH>Description</TH><TH className="text-right">Amount</TH><TH /></TR></THead>
              <TBody>
                {run.adjustments.map((a) => (
                  <TR key={a.id}>
                    <TD>{empName.get(a.employeeId) ?? run.payslips.find((p) => p.employeeId === a.employeeId)?.employeeName ?? "—"}</TD>
                    <TD>{a.component.kind === "ALLOWANCE" ? "+" : "−"} {a.component.name}</TD>
                    <TD>{a.description ?? "—"}</TD>
                    <TD className="tabular text-right">{money(a.amount)}</TD>
                    <TD className="text-right">{editable && canRun && <ActionButton action={removeAdjustmentAction} fields={{ id: a.id }} variant="ghost" size="sm">Remove</ActionButton>}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
          {editable && canRun && (
            <CardContent className="pt-4">
              <ActionForm action={addAdjustmentAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" resetOnSuccess>
                <input type="hidden" name="runId" value={run.id} />
                <Field label="Employee" htmlFor="adj-emp"><Select id="adj-emp" name="employeeId">{employees.map((e) => <option key={e.id} value={e.id}>{e.lastName}, {e.firstName}</option>)}</Select></Field>
                <Field label="Component" htmlFor="adj-comp"><Select id="adj-comp" name="componentId">{components.filter((c) => c.calcType === "FIXED").map((c) => <option key={c.id} value={c.id}>{c.kind === "ALLOWANCE" ? "+" : "−"} {c.name}</option>)}</Select></Field>
                <Field label="Amount (SRD)" htmlFor="adj-amount"><Input id="adj-amount" name="amount" inputMode="decimal" /><FieldError name="amount" /></Field>
                <Field label="Description" htmlFor="adj-desc"><Input id="adj-desc" name="description" /></Field>
                <div className="flex items-end"><SubmitButton variant="outline">Add adjustment</SubmitButton></div>
              </ActionForm>
            </CardContent>
          )}
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between">
          <div><CardTitle>Payslips</CardTitle><CardDescription>{run.payslips.length} payslips · total deductions {money(totalDeductions)}</CardDescription></div>
          {run.payslips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <a href={`/api/payroll/${run.id}/payslips.pdf`} className={buttonVariants({ variant: "outline", size: "sm" })}><Download /> All payslips (PDF)</a>
              <a href={`/api/payroll/${run.id}/journal.csv`} className={buttonVariants({ variant: "outline", size: "sm" })}><Download /> Payroll journal</a>
              {(run.status === "APPROVED" || run.status === "PAID") && <a href={`/api/payroll/${run.id}/bank.csv`} className={buttonVariants({ variant: "outline", size: "sm" })}><Download /> Bank payment file</a>}
            </div>
          )}
        </CardHeader>
        {run.payslips.length === 0 ? (
          <EmptyState title="Not calculated yet" description="Save the period inputs and click “Calculate payroll” to generate payslips." />
        ) : (
          <Table>
            <THead><TR><TH>Employee</TH><TH className="text-right">Gross</TH><TH className="text-right">Wage tax</TH><TH className="text-right">AOV</TH><TH className="text-right">Deductions</TH><TH className="text-right">Net pay</TH><TH className="text-right">Employer cost</TH><TH /></TR></THead>
            <TBody>
              {run.payslips.map((p) => (
                <TR key={p.id}>
                  <TD className="font-medium">{p.employeeName}<span className="block text-xs font-normal text-muted-foreground">#{p.employeeNumber}</span></TD>
                  <TD className="tabular text-right">{amount(p.grossPay)}</TD>
                  <TD className="tabular text-right">{amount(p.wageTax)}</TD>
                  <TD className="tabular text-right">{amount(p.aov)}</TD>
                  <TD className="tabular text-right">{amount(p.totalDeductions)}</TD>
                  <TD className="tabular text-right font-semibold">{amount(p.netPay)}</TD>
                  <TD className="tabular text-right text-muted-foreground">{amount(p.employerCost)}</TD>
                  <TD className="text-right"><Link href={`/app/payslips/${p.id}`} className="text-primary hover:underline">View</Link></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {editable && canRun && (
        <div className="mt-8 flex justify-end">
          <ActionButton action={deleteRunAction} fields={{ runId: run.id }} variant="ghost" className="text-destructive" confirm="Delete this payroll run and all its payslips?">Delete payroll run</ActionButton>
        </div>
      )}
    </div>
  );
}
