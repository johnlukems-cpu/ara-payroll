import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { can } from "@/lib/permissions";
import { ActionForm } from "@/components/action-form";
import { ActionButton } from "@/components/confirm-button";
import { SubmitButton } from "@/components/submit-button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert, EmptyState, PageHeader } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
import { LegalBadge } from "@/components/legal-badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ParentalRequestFields } from "@/components/parental-request-fields";
import { cancelLeaveAction, decideLeaveAction, requestLeaveAction, updateLeavePaymentAction } from "@/app/actions/leave";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("parental.title") };
}

const CATS = ["PARENTAL", "MATERNITY", "PATERNITY", "ADOPTION"] as const;
const PAY = ["NOT_APPLICABLE", "PENDING", "PAID_BY_EMPLOYER", "PARTIALLY_PAID", "UNPAID", "PAID_BY_FUND"] as const;

export default async function ParentalLeavePage() {
  const ctx = await requirePage("leave.view");
  const { t, f } = await getI18n();
  const canApprove = can(ctx.role, "leave.approve");
  const companyId = ctx.company.id;
  const [types, requests, employees] = await Promise.all([
    db.leaveType.findMany({ where: { companyId, category: { in: [...CATS] } }, orderBy: { name: "asc" } }),
    db.leaveRequest.findMany({ where: { employee: { companyId }, leaveType: { category: { in: [...CATS] } } }, include: { employee: true, leaveType: true, documents: { select: { id: true, fileName: true } } }, orderBy: { startDate: "desc" } }),
    db.employee.findMany({ where: { companyId, status: { not: "TERMINATED" } }, orderBy: [{ lastName: "asc" }] }),
  ]);
  const deciders = new Map((await db.user.findMany({ where: { id: { in: requests.map((r) => r.decidedById).filter(Boolean) as string[] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));

  return (
    <div>
      <Link href="/app/leave" className={buttonVariants({ variant: "ghost", className: "mb-2" })}><ArrowLeft /> {t("leave.title")}</Link>
      <PageHeader title={t("parental.title")} description={t("parental.subtitle")} />
      <Alert variant="warning" className="mb-6">{t("parental.legalNote")}</Alert>

      <Card className="mb-6">
        <CardHeader><CardTitle>{t("parental.policies")}</CardTitle><CardDescription>{t("parental.policiesSub")} <Link href="/app/settings/leave" className="text-primary hover:underline">{t("leave.manageTypes")}</Link></CardDescription></CardHeader>
        <Table>
          <THead><TR><TH>{t("parental.cols.type")}</TH><TH className="text-right">{t("parental.cols.statutory")}</TH><TH className="text-right">{t("parental.cols.companyExtra")}</TH><TH className="text-right">{t("parental.cols.pay")}</TH><TH>{t("parental.cols.partTime")}</TH><TH>{t("parental.cols.legal")}</TH><TH>{t("parental.cols.reference")}</TH></TR></THead>
          <TBody>
            {types.map((x) => (
              <TR key={x.id}>
                <TD className="font-medium">{x.name}</TD>
                <TD className="tabular text-right">{x.statutoryDays != null ? t("parental.days", { days: f.number(x.statutoryDays) }) : "—"}</TD>
                <TD className="tabular text-right">{x.companyExtraDays ? t("parental.days", { days: f.number(x.companyExtraDays) }) : "—"}</TD>
                <TD className="tabular text-right">{f.pct(x.payPercentBp)}</TD>
                <TD>{x.allowPartTime ? t("common.yes") : t("common.no")}</TD>
                <TD><LegalBadge status={x.legalStatus} /></TD>
                <TD className="max-w-xs text-xs text-muted-foreground">{x.legalReference ?? "—"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>{t("parental.requests")}</CardTitle></CardHeader>
          {requests.length === 0 ? <EmptyState title={t("parental.none")} /> : (
            <div className="divide-y">
              {requests.map((r) => (
                <div key={r.id} className="space-y-2 p-4 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium"><Link href={`/app/employees/${r.employeeId}?tab=parental`} className="text-primary hover:underline">{r.employee.firstName} {r.employee.lastName}</Link> · {r.leaveType.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {f.date(r.startDate)} – {f.date(r.endDate)} · {t("parental.requested", { days: f.number(r.days) })}
                        {r.approvedDays != null && ` · ${t("parental.approvedDays", { days: f.number(r.approvedDays) })}`}
                        {r.schedulePercentBp < 10000 && ` · ${t("parental.partTime", { pct: f.pct(r.schedulePercentBp) })}`}
                        {r.childBirthDate && ` · ${t("parental.child", { date: f.date(r.childBirthDate) })}`}
                      </p>
                      {r.scheduleNote && <p className="text-xs">{r.scheduleNote}</p>}
                      {r.documents.length > 0 && <p className="text-xs">{r.documents.map((d) => <a key={d.id} href={`/api/documents/${d.id}`} className="mr-2 text-primary hover:underline">{d.fileName}</a>)}</p>}
                    </div>
                    <div className="flex items-center gap-2"><StatusBadge status={r.status} /><span className="text-xs text-muted-foreground">{t(`parental.payment.${r.paymentStatus}`)}</span></div>
                  </div>
                  {r.decidedById && <p className="text-xs text-muted-foreground">{t("parental.decidedBy", { name: deciders.get(r.decidedById) ?? "—", date: f.date(r.decidedAt) })}</p>}
                  {canApprove && r.status === "PENDING" && (
                    <ActionForm notify="toast" action={decideLeaveAction} className="flex flex-wrap items-end gap-2 rounded-lg bg-muted/40 p-3">
                      <input type="hidden" name="id" value={r.id} />
                      <Field label={t("parental.f.approvedDays")} htmlFor={`ad-${r.id}`}><Input id={`ad-${r.id}`} name="approvedDays" defaultValue={f.number(r.days)} className="w-24" /></Field>
                      <Field label={t("parental.f.paymentStatus")} htmlFor={`ps-${r.id}`}><Select id={`ps-${r.id}`} name="paymentStatus" defaultValue={r.leaveType.payPercentBp >= 10000 ? "PAID_BY_EMPLOYER" : r.leaveType.payPercentBp > 0 ? "PARTIALLY_PAID" : "UNPAID"} className="w-48">{PAY.map((p) => <option key={p} value={p}>{t(`parental.payment.${p}`)}</option>)}</Select></Field>
                      <SubmitButton size="sm" variant="accent" name="decision" value="APPROVED">{t("leave.approve")}</SubmitButton>
                      <SubmitButton size="sm" variant="outline" name="decision" value="REJECTED">{t("leave.reject")}</SubmitButton>
                    </ActionForm>
                  )}
                  {canApprove && r.status === "APPROVED" && (
                    <div className="flex flex-wrap items-end gap-2">
                      <ActionForm action={updateLeavePaymentAction} className="flex items-end gap-2">
                        <input type="hidden" name="id" value={r.id} />
                        <Select name="paymentStatus" defaultValue={r.paymentStatus} className="h-8 w-48" aria-label={t("parental.f.paymentStatus")}>{PAY.map((p) => <option key={p} value={p}>{t(`parental.payment.${p}`)}</option>)}</Select>
                        <SubmitButton size="sm" variant="outline">{t("common.update")}</SubmitButton>
                      </ActionForm>
                      <ActionButton action={cancelLeaveAction} fields={{ id: r.id }} size="sm" variant="ghost" confirm={t("leave.cancelApprovedConfirm")}>{t("leave.cancel")}</ActionButton>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
        {canApprove && (
          <Card>
            <CardHeader><CardTitle>{t("parental.register")}</CardTitle><CardDescription>{t("parental.registerSub")}</CardDescription></CardHeader>
            <CardContent>
              <ActionForm action={requestLeaveAction} className="space-y-3" resetOnSuccess>
                <Field label={t("leave.employee")} htmlFor="employeeId"><Select id="employeeId" name="employeeId">{employees.map((e) => <option key={e.id} value={e.id}>{e.lastName}, {e.firstName}</option>)}</Select></Field>
                <ParentalRequestFields types={types} />
                <SubmitButton className="w-full">{t("parental.submit")}</SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
