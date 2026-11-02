import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { can } from "@/lib/permissions";
import { date, money, pct, periodLabel, toDateInput } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ActionForm, FieldError } from "@/components/action-form";
import { ActionButton } from "@/components/confirm-button";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert, EmptyState, PageHeader } from "@/components/ui/misc";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  addContractAction, assignComponentAction, deleteDocumentAction, enableSelfServiceAction,
  removeComponentAction, updateEmployeeAction, uploadDocumentAction,
} from "@/app/actions/employees";
import { ContractFields, EmployeeFields } from "../fields";

const TABS = [
  { id: "details", label: "Details" },
  { id: "contracts", label: "Contracts & salary" },
  { id: "pay", label: "Allowances & deductions" },
  { id: "payslips", label: "Payslips" },
  { id: "leave", label: "Leave" },
  { id: "documents", label: "Documents" },
];

export default async function EmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; created?: string }> }) {
  const ctx = await requirePage("employees.view");
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.some((t) => t.id === sp.tab) ? sp.tab! : "details";
  const canEdit = can(ctx.role, "employees.edit");
  const canSalary = can(ctx.role, "employees.viewSalary");

  const e = await db.employee.findFirst({
    where: { id, companyId: ctx.company.id },
    include: {
      department: true,
      contracts: { orderBy: { startDate: "desc" } },
      components: { include: { component: true }, orderBy: { startDate: "desc" } },
      documents: { orderBy: { createdAt: "desc" } },
      leaveRequests: { include: { leaveType: true }, orderBy: { startDate: "desc" }, take: 50 },
      payslips: { include: { run: true }, orderBy: [{ run: { year: "desc" } }, { run: { month: "desc" } }], take: 36 },
    },
  });
  if (!e) notFound();
  const visibleTabs = TABS.filter((t) => canSalary || !["contracts", "pay", "payslips"].includes(t.id));
  const current = e.contracts[0];

  return (
    <div>
      <PageHeader
        title={`${e.firstName} ${e.lastName}`}
        description={`#${e.employeeNumber} · ${e.jobTitle ?? "No job title"}${e.department ? ` · ${e.department.name}` : ""}`}
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status={e.status} />
            {e.userId ? <Badge variant="accent">Self-service enabled</Badge> : can(ctx.role, "users.manage") && <ActionButton action={enableSelfServiceAction} fields={{ employeeId: e.id }} variant="outline" size="sm">Enable self-service</ActionButton>}
          </div>
        }
      />
      {sp.created && <Alert variant="success" className="mb-4">Employee created successfully.</Alert>}
      <div className="mb-6 flex gap-1 overflow-x-auto border-b">
        {visibleTabs.map((t) => (
          <Link key={t.id} href={`?tab=${t.id}`} className={cn("-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm", tab === t.id ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "details" && (
        canEdit ? (
          <ActionForm action={updateEmployeeAction} className="space-y-5">
            <input type="hidden" name="id" value={e.id} />
            <EmployeeFields e={e} departments={await db.department.findMany({ where: { companyId: ctx.company.id }, orderBy: { name: "asc" } })} showStatus />
            <div className="flex justify-end"><SubmitButton>Save changes</SubmitButton></div>
          </ActionForm>
        ) : (
          <Card><CardContent className="grid gap-4 pt-5 sm:grid-cols-3 text-sm">
            {[["ID number", e.idNumber], ["Date of birth", date(e.dateOfBirth)], ["Email", e.email], ["Phone", e.phone], ["District", e.district], ["Hire date", date(e.hireDate)], ["Children", e.numberOfChildren]].map(([k, v]) => (
              <div key={String(k)}><p className="text-muted-foreground">{k}</p><p className="font-medium">{v ?? "—"}</p></div>
            ))}
          </CardContent></Card>
        )
      )}

      {tab === "contracts" && canSalary && (
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Contract & salary history</CardTitle><CardDescription>The most recent contract effective in a period is used for payroll.</CardDescription></CardHeader>
            <Table>
              <THead><TR><TH>Effective</TH><TH>Ends</TH><TH>Type</TH><TH>Pay</TH><TH className="text-right">Amount</TH><TH>Hours/wk</TH><TH>Pension (ee/er)</TH></TR></THead>
              <TBody>
                {e.contracts.map((c) => (
                  <TR key={c.id}>
                    <TD className="tabular">{date(c.startDate)} {c.id === current?.id && <Badge variant="success" className="ml-1">Current</Badge>}</TD>
                    <TD className="tabular">{date(c.endDate)}</TD>
                    <TD>{c.contractType.replace("_", " ").toLowerCase()}</TD>
                    <TD>{c.payType.toLowerCase()}</TD>
                    <TD className="tabular text-right">{c.payType === "MONTHLY" ? money(c.baseSalary) : `${money(c.hourlyRate)}/h`}</TD>
                    <TD>{c.hoursPerWeek}</TD>
                    <TD>{pct(c.pensionEmployeeBp)} / {pct(c.pensionEmployerBp)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          {canEdit && (
            <Card>
              <CardHeader><CardTitle>Record a new contract or salary change</CardTitle><CardDescription>Previous records are retained for history and audit purposes.</CardDescription></CardHeader>
              <CardContent>
                <ActionForm action={addContractAction} className="space-y-4" resetOnSuccess>
                  <input type="hidden" name="employeeId" value={e.id} />
                  <ContractFields c={current} />
                  <div className="flex justify-end"><SubmitButton>Save contract</SubmitButton></div>
                </ActionForm>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === "pay" && canSalary && (
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Recurring allowances & deductions</CardTitle><CardDescription>Applied automatically in every payroll run within the active date range.</CardDescription></CardHeader>
            {e.components.length === 0 ? <EmptyState title="No recurring components" /> : (
              <Table>
                <THead><TR><TH>Component</TH><TH>Type</TH><TH className="text-right">Amount</TH><TH>From</TH><TH>Until</TH><TH /></TR></THead>
                <TBody>
                  {e.components.map((a) => (
                    <TR key={a.id}>
                      <TD className="font-medium">{a.component.name}</TD>
                      <TD><Badge variant={a.component.kind === "ALLOWANCE" ? "success" : "warning"}>{a.component.kind.toLowerCase()}</Badge></TD>
                      <TD className="tabular text-right">{a.component.calcType === "FIXED" ? money(a.amount) : `${pct(a.rateBp)} of base`}</TD>
                      <TD className="tabular">{date(a.startDate)}</TD>
                      <TD className="tabular">{date(a.endDate)}</TD>
                      <TD className="text-right">{canEdit && <ActionButton action={removeComponentAction} fields={{ id: a.id }} variant="ghost" size="sm" confirm="Remove this component?">Remove</ActionButton>}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
          {canEdit && (
            <Card>
              <CardHeader><CardTitle>Add allowance or deduction</CardTitle></CardHeader>
              <CardContent>
                <ActionForm action={assignComponentAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5" resetOnSuccess>
                  <input type="hidden" name="employeeId" value={e.id} />
                  <Field label="Component" htmlFor="componentId" className="lg:col-span-2">
                    <Select id="componentId" name="componentId">
                      {(await db.payComponent.findMany({ where: { companyId: ctx.company.id, isActive: true }, orderBy: [{ kind: "asc" }, { name: "asc" }] })).map((c) => (
                        <option key={c.id} value={c.id}>{c.kind === "ALLOWANCE" ? "+" : "−"} {c.name}{c.calcType === "PERCENT_OF_BASE" ? " (%)" : ""}</option>
                      ))}
                    </Select>
                    <FieldError name="componentId" />
                  </Field>
                  <Field label="Amount (SRD)" htmlFor="amount" hint="For fixed components"><Input id="amount" name="amount" inputMode="decimal" /><FieldError name="amount" /></Field>
                  <Field label="Percentage" htmlFor="rate" hint="For % of base salary"><Input id="rate" name="rate" inputMode="decimal" /><FieldError name="rate" /></Field>
                  <Field label="From" htmlFor="startDate"><Input id="startDate" name="startDate" type="date" defaultValue={toDateInput(new Date())} /><FieldError name="startDate" /></Field>
                  <Field label="Until (optional)" htmlFor="endDate"><Input id="endDate" name="endDate" type="date" /></Field>
                  <div className="flex items-end lg:col-span-4 lg:justify-end"><SubmitButton>Add</SubmitButton></div>
                </ActionForm>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === "payslips" && canSalary && (
        <Card>
          {e.payslips.length === 0 ? <EmptyState title="No payslips yet" /> : (
            <Table>
              <THead><TR><TH>Period</TH><TH>Run status</TH><TH className="text-right">Gross</TH><TH className="text-right">Wage tax</TH><TH className="text-right">AOV</TH><TH className="text-right">Net</TH><TH /></TR></THead>
              <TBody>
                {e.payslips.map((p) => (
                  <TR key={p.id}>
                    <TD>{periodLabel(p.run.year, p.run.month)}</TD>
                    <TD><StatusBadge status={p.run.status} /></TD>
                    <TD className="tabular text-right">{money(p.grossPay)}</TD>
                    <TD className="tabular text-right">{money(p.wageTax)}</TD>
                    <TD className="tabular text-right">{money(p.aov)}</TD>
                    <TD className="tabular text-right font-medium">{money(p.netPay)}</TD>
                    <TD className="text-right"><Link className="text-primary hover:underline" href={`/app/payslips/${p.id}`}>View</Link></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      )}

      {tab === "leave" && (
        <Card>
          {e.leaveRequests.length === 0 ? <EmptyState title="No leave recorded" /> : (
            <Table>
              <THead><TR><TH>Type</TH><TH>From</TH><TH>To</TH><TH className="text-right">Days</TH><TH>Status</TH></TR></THead>
              <TBody>
                {e.leaveRequests.map((l) => (
                  <TR key={l.id}><TD>{l.leaveType.name}</TD><TD className="tabular">{date(l.startDate)}</TD><TD className="tabular">{date(l.endDate)}</TD><TD className="tabular text-right">{l.days}</TD><TD><StatusBadge status={l.status} /></TD></TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      )}

      {tab === "documents" && (
        <div className="space-y-6">
          <Card>
            {e.documents.length === 0 ? <EmptyState title="No documents" description="Upload signed contracts, ID copies and other personnel documents." /> : (
              <Table>
                <THead><TR><TH>File</TH><TH>Size</TH><TH>Uploaded</TH><TH /></TR></THead>
                <TBody>
                  {e.documents.map((d) => (
                    <TR key={d.id}>
                      <TD><a className="font-medium text-primary hover:underline" href={`/api/documents/${d.id}`}>{d.fileName}</a></TD>
                      <TD>{(d.size / 1024).toFixed(0)} KB</TD>
                      <TD className="tabular">{date(d.createdAt)}</TD>
                      <TD className="text-right">{canEdit && <ActionButton action={deleteDocumentAction} fields={{ id: d.id }} variant="ghost" size="sm" confirm="Delete this document permanently?">Delete</ActionButton>}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
          {canEdit && (
            <Card>
              <CardHeader><CardTitle>Upload document</CardTitle><CardDescription>PDF, PNG, JPEG or DOCX, up to 8 MB.</CardDescription></CardHeader>
              <CardContent>
                <ActionForm action={uploadDocumentAction} className="flex flex-wrap items-end gap-3" resetOnSuccess>
                  <input type="hidden" name="employeeId" value={e.id} />
                  <Input type="file" name="file" accept=".pdf,.png,.jpg,.jpeg,.docx" className="max-w-sm py-1.5" aria-label="File" />
                  <SubmitButton pendingText="Uploading…">Upload</SubmitButton>
                </ActionForm>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
