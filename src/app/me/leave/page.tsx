import { db } from "@/lib/db";
import { requireSelf } from "@/lib/server/self-service";
import { leaveBalances } from "@/lib/server/leave-balance";
import { date, toDateInput } from "@/lib/format";
import { ActionForm, FieldError } from "@/components/action-form";
import { ActionButton } from "@/components/confirm-button";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cancelLeaveAction, requestLeaveAction } from "@/app/actions/leave";
import { NoProfile } from "../no-profile";

export const metadata = { title: "My leave" };

export default async function MyLeave() {
  const { ctx, employee } = await requireSelf();
  if (!employee) return <NoProfile />;
  const [balances, requests, types] = await Promise.all([
    leaveBalances(ctx.company!.id, employee.id, new Date().getUTCFullYear()),
    db.leaveRequest.findMany({ where: { employeeId: employee.id }, include: { leaveType: true }, orderBy: { startDate: "desc" } }),
    db.leaveType.findMany({ where: { companyId: ctx.company!.id }, orderBy: { name: "asc" } }),
  ]);
  const today = toDateInput(new Date());
  return (
    <div>
      <PageHeader title="My leave" />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {balances.map((b) => (
          <div key={b.type.id} className="rounded-xl border bg-card p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{b.type.name}</p>
            <p className="mt-2 text-2xl font-semibold">{b.remaining} <span className="text-sm font-normal text-muted-foreground">days left</span></p>
            <p className="text-xs text-muted-foreground">{b.taken} used of {b.entitlement}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>My requests</CardTitle></CardHeader>
          {requests.length === 0 ? <EmptyState title="No leave requests yet" /> : (
            <Table>
              <THead><TR><TH>Type</TH><TH>Period</TH><TH className="text-right">Days</TH><TH>Status</TH><TH /></TR></THead>
              <TBody>
                {requests.map((r) => (
                  <TR key={r.id}>
                    <TD>{r.leaveType.name}</TD>
                    <TD className="tabular">{date(r.startDate)} – {date(r.endDate)}</TD>
                    <TD className="tabular text-right">{r.days}</TD>
                    <TD><StatusBadge status={r.status} /></TD>
                    <TD className="text-right">{r.status === "PENDING" && <ActionButton action={cancelLeaveAction} fields={{ id: r.id }} size="sm" variant="ghost">Cancel</ActionButton>}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader><CardTitle>Request leave</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={requestLeaveAction} className="space-y-3" resetOnSuccess>
              <Field label="Type" htmlFor="leaveTypeId"><Select id="leaveTypeId" name="leaveTypeId">{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="From" htmlFor="startDate"><Input id="startDate" name="startDate" type="date" defaultValue={today} /><FieldError name="startDate" /></Field>
                <Field label="To" htmlFor="endDate"><Input id="endDate" name="endDate" type="date" defaultValue={today} /><FieldError name="endDate" /></Field>
              </div>
              <Field label="Reason (optional)" htmlFor="reason"><Input id="reason" name="reason" /></Field>
              <SubmitButton className="w-full">Submit request</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
