import Link from "next/link";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { can } from "@/lib/permissions";
import { date, toDateInput } from "@/lib/format";
import { ActionForm, FieldError } from "@/components/action-form";
import { ActionButton } from "@/components/confirm-button";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cancelLeaveAction, decideLeaveAction, requestLeaveAction } from "@/app/actions/leave";

export const metadata = { title: "Leave" };

export default async function LeavePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const ctx = await requirePage("leave.view");
  const sp = await searchParams;
  const canApprove = can(ctx.role, "leave.approve");
  const status = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"].includes(sp.status ?? "") ? sp.status : undefined;
  const companyId = ctx.company.id;
  const today = new Date();
  const [requests, pending, onLeaveToday, types, employees] = await Promise.all([
    db.leaveRequest.findMany({ where: { employee: { companyId }, ...(status ? { status: status as "PENDING" } : {}) }, include: { employee: true, leaveType: true }, orderBy: { startDate: "desc" }, take: 200 }),
    db.leaveRequest.count({ where: { employee: { companyId }, status: "PENDING" } }),
    db.leaveRequest.count({ where: { employee: { companyId }, status: "APPROVED", startDate: { lte: today }, endDate: { gte: today } } }),
    db.leaveType.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    db.employee.findMany({ where: { companyId, status: { not: "TERMINATED" } }, orderBy: [{ lastName: "asc" }] }),
  ]);

  return (
    <div>
      <PageHeader title="Leave management" description="Requests, approvals and absence records." />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Pending requests" value={pending} />
        <Stat label="On leave today" value={onLeaveToday} />
        <Stat label="Leave types" value={types.length} sub={<Link href="/app/settings/leave" className="text-primary hover:underline">Manage types</Link>} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Requests</CardTitle>
            <div className="flex gap-1 text-sm">
              {[["", "All"], ["PENDING", "Pending"], ["APPROVED", "Approved"], ["REJECTED", "Rejected"]].map(([v, l]) => (
                <Link key={v} href={v ? `?status=${v}` : "?"} className={`rounded-md px-2.5 py-1 ${status === v || (!status && !v) ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted"}`}>{l}</Link>
              ))}
            </div>
          </CardHeader>
          {requests.length === 0 ? <EmptyState title="No leave requests" /> : (
            <Table>
              <THead><TR><TH>Employee</TH><TH>Type</TH><TH>Period</TH><TH className="text-right">Days</TH><TH>Status</TH><TH /></TR></THead>
              <TBody>
                {requests.map((r) => (
                  <TR key={r.id}>
                    <TD className="font-medium">{r.employee.firstName} {r.employee.lastName}{r.reason && <span className="block text-xs font-normal text-muted-foreground">{r.reason}</span>}</TD>
                    <TD>{r.leaveType.name}</TD>
                    <TD className="tabular whitespace-nowrap">{date(r.startDate)} – {date(r.endDate)}</TD>
                    <TD className="tabular text-right">{r.days}</TD>
                    <TD><StatusBadge status={r.status} /></TD>
                    <TD className="text-right">
                      {canApprove && r.status === "PENDING" && (
                        <div className="flex justify-end gap-1">
                          <ActionButton action={decideLeaveAction} fields={{ id: r.id, decision: "APPROVED" }} size="sm" variant="accent">Approve</ActionButton>
                          <ActionButton action={decideLeaveAction} fields={{ id: r.id, decision: "REJECTED" }} size="sm" variant="outline">Reject</ActionButton>
                        </div>
                      )}
                      {canApprove && r.status === "APPROVED" && <ActionButton action={cancelLeaveAction} fields={{ id: r.id }} size="sm" variant="ghost" confirm="Cancel this approved leave?">Cancel</ActionButton>}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
        {canApprove && (
          <Card>
            <CardHeader><CardTitle>Record leave</CardTitle><CardDescription>Leave entered here is approved immediately. Working days exclude weekends and fixed public holidays.</CardDescription></CardHeader>
            <CardContent>
              <ActionForm action={requestLeaveAction} className="space-y-3" resetOnSuccess>
                <Field label="Employee" htmlFor="employeeId"><Select id="employeeId" name="employeeId">{employees.map((e) => <option key={e.id} value={e.id}>{e.lastName}, {e.firstName}</option>)}</Select></Field>
                <Field label="Leave type" htmlFor="leaveTypeId"><Select id="leaveTypeId" name="leaveTypeId">{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="From" htmlFor="startDate"><Input id="startDate" name="startDate" type="date" defaultValue={toDateInput(today)} /><FieldError name="startDate" /></Field>
                  <Field label="To" htmlFor="endDate"><Input id="endDate" name="endDate" type="date" defaultValue={toDateInput(today)} /><FieldError name="endDate" /></Field>
                </div>
                <Field label="Days (optional)" htmlFor="days" hint="Leave empty to calculate working days automatically"><Input id="days" name="days" inputMode="decimal" /><FieldError name="days" /></Field>
                <Field label="Note" htmlFor="reason"><Input id="reason" name="reason" /></Field>
                <SubmitButton className="w-full">Record leave</SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
