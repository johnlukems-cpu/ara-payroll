import Link from "next/link";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { can } from "@/lib/permissions";
import { toDateInput } from "@/lib/format";
import { ActionForm, FieldError } from "@/components/action-form";
import { buttonVariants } from "@/components/ui/button";
import { ActionButton } from "@/components/confirm-button";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cancelLeaveAction, decideLeaveAction, requestLeaveAction } from "@/app/actions/leave";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("nav.leave") };
}

const FILTERS = ["", "PENDING", "APPROVED", "REJECTED"] as const;

export default async function LeavePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const ctx = await requirePage("leave.view");
  const { t, f } = await getI18n();
  const sp = await searchParams;
  const canApprove = can(ctx.role, "leave.approve");
  const status = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"].includes(sp.status ?? "") ? sp.status : undefined;
  const companyId = ctx.company.id;
  const today = new Date();
  const [requests, pending, onLeaveToday, types, employees] = await Promise.all([
    db.leaveRequest.findMany({ where: { employee: { companyId }, ...(status ? { status: status as "PENDING" } : {}) }, include: { employee: true, leaveType: true }, orderBy: { startDate: "desc" }, take: 200 }),
    db.leaveRequest.count({ where: { employee: { companyId }, status: "PENDING" } }),
    db.leaveRequest.count({ where: { employee: { companyId }, status: "APPROVED", startDate: { lte: today }, endDate: { gte: today } } }),
    db.leaveType.findMany({ where: { companyId, category: { notIn: ["PARENTAL", "MATERNITY", "PATERNITY", "ADOPTION"] } }, orderBy: { name: "asc" } }),
    db.employee.findMany({ where: { companyId, status: { not: "TERMINATED" } }, orderBy: [{ lastName: "asc" }] }),
  ]);

  return (
    <div>
      <PageHeader title={t("leave.title")} description={t("leave.subtitle")} actions={<Link href="/app/leave/parental" className={buttonVariants({ variant: "outline" })}>{t("parental.title")}</Link>} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t("leave.pending")} value={pending} />
        <Stat label={t("leave.onLeaveToday")} value={onLeaveToday} />
        <Stat label={t("leave.types")} value={types.length} sub={<Link href="/app/settings/leave" className="text-primary hover:underline">{t("leave.manageTypes")}</Link>} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t("leave.requests")}</CardTitle>
            <div className="flex gap-1 text-sm">
              {FILTERS.map((v) => (
                <Link key={v} href={v ? `?status=${v}` : "?"} className={`rounded-md px-2.5 py-1 ${status === v || (!status && !v) ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted"}`}>{v ? t(`leave.filter.${v}`) : t("leave.filter.all")}</Link>
              ))}
            </div>
          </CardHeader>
          {requests.length === 0 ? <EmptyState title={t("leave.none")} /> : (
            <Table>
              <THead><TR><TH>{t("leave.cols.employee")}</TH><TH>{t("leave.cols.type")}</TH><TH>{t("leave.cols.period")}</TH><TH className="text-right">{t("leave.cols.days")}</TH><TH>{t("leave.cols.status")}</TH><TH /></TR></THead>
              <TBody>
                {requests.map((r) => (
                  <TR key={r.id}>
                    <TD className="font-medium">{r.employee.firstName} {r.employee.lastName}{r.reason && <span className="block text-xs font-normal text-muted-foreground">{r.reason}</span>}</TD>
                    <TD>{r.leaveType.name}</TD>
                    <TD className="tabular whitespace-nowrap">{f.date(r.startDate)} – {f.date(r.endDate)}</TD>
                    <TD className="tabular text-right">{f.number(r.days)}</TD>
                    <TD><StatusBadge status={r.status} /></TD>
                    <TD className="text-right">
                      {canApprove && r.status === "PENDING" && (
                        <div className="flex justify-end gap-1">
                          <ActionButton action={decideLeaveAction} fields={{ id: r.id, decision: "APPROVED" }} size="sm" variant="accent">{t("leave.approve")}</ActionButton>
                          <ActionButton action={decideLeaveAction} fields={{ id: r.id, decision: "REJECTED" }} size="sm" variant="outline">{t("leave.reject")}</ActionButton>
                        </div>
                      )}
                      {canApprove && r.status === "APPROVED" && <ActionButton action={cancelLeaveAction} fields={{ id: r.id }} size="sm" variant="ghost" confirm={t("leave.cancelApprovedConfirm")}>{t("leave.cancel")}</ActionButton>}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
        {canApprove && (
          <Card>
            <CardHeader><CardTitle>{t("leave.recordTitle")}</CardTitle><CardDescription>{t("leave.recordSub")}</CardDescription></CardHeader>
            <CardContent>
              <ActionForm action={requestLeaveAction} className="space-y-3" resetOnSuccess>
                <Field label={t("leave.employee")} htmlFor="employeeId"><Select id="employeeId" name="employeeId">{employees.map((e) => <option key={e.id} value={e.id}>{e.lastName}, {e.firstName}</option>)}</Select></Field>
                <Field label={t("leave.leaveType")} htmlFor="leaveTypeId"><Select id="leaveTypeId" name="leaveTypeId">{types.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t("leave.from")} htmlFor="startDate"><Input id="startDate" name="startDate" type="date" defaultValue={toDateInput(today)} /><FieldError name="startDate" /></Field>
                  <Field label={t("leave.to")} htmlFor="endDate"><Input id="endDate" name="endDate" type="date" defaultValue={toDateInput(today)} /><FieldError name="endDate" /></Field>
                </div>
                <Field label={t("leave.days")} htmlFor="days" hint={t("leave.daysHint")}><Input id="days" name="days" inputMode="decimal" /><FieldError name="days" /></Field>
                <Field label={t("leave.note")} htmlFor="reason"><Input id="reason" name="reason" /></Field>
                <SubmitButton className="w-full">{t("leave.record")}</SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
