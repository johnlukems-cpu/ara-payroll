import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { can } from "@/lib/permissions";
import { toDateInput } from "@/lib/format";
import type { DeclarationSnapshot } from "@/lib/declarations/aggregate";
import { allowedActions, DECLARATION_STATUSES } from "@/lib/declarations/status";
import { ActionForm, FieldError } from "@/components/action-form";
import { ActionButton } from "@/components/confirm-button";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Stat } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DeclarationStatusBadge } from "../../status-badge";
import {
  approveDeclarationAction, createSupplementaryAction, recalculateDeclarationAction, recordOutcomeAction, recordPaymentAction,
  recordSubmissionAction, regenerateFilesAction, returnToCalculatedAction, revokeApprovalAction, submitForReviewAction,
} from "@/app/actions/declarations";

export default async function DeclarationPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("tax.view");
  const { t, f } = await getI18n();
  const { id } = await params;
  const d = await db.declaration.findFirst({
    where: { id, companyId: ctx.company.id },
    include: { files: { select: { id: true, kind: true, format: true, fileName: true, size: true, downloadCount: true, createdAt: true }, orderBy: [{ kind: "asc" }, { format: "asc" }] }, events: { orderBy: { createdAt: "desc" } } },
  });
  if (!d) notFound();
  const userIds = [...new Set([...d.events.map((e) => e.userId), d.approvedById, d.legalAcknowledgedById].filter(Boolean) as string[])];
  const users = new Map((await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const versions = await db.declaration.findMany({ where: { companyId: ctx.company.id, type: d.type, year: d.year, month: d.month }, orderBy: { version: "asc" }, select: { id: true, version: true, status: true } });
  const s = d.snapshot as unknown as DeclarationSnapshot;
  const actions = new Set(allowedActions(d.status));
  const canPrepare = can(ctx.role, "declarations.prepare");
  const canApprove = can(ctx.role, "declarations.approve");
  const period = d.month ? f.period(d.year, d.month) : String(d.year);
  const fields = { id: d.id };
  const stepIndex = DECLARATION_STATUSES.indexOf(d.status);
  const flow = ["CALCULATED", "UNDER_REVIEW", "APPROVED", "READY_FOR_DOWNLOAD", "DOWNLOADED", "SUBMITTED", "ACCEPTED", "PAID"] as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{t(`decl.type.${d.type}`)} — {period}</h2>
          <p className="text-sm text-muted-foreground">
            {t("decl.deadline", { date: f.date(d.deadline) })} · {s.company.legalName ?? s.company.name}
            {s.company.taxNumber ? ` · FIB ${s.company.taxNumber}` : ""}{s.company.kkfNumber ? ` · KKF ${s.company.kkfNumber}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {versions.length > 1 && versions.map((v) => <Link key={v.id} href={`/app/tax/declarations/${v.id}`}><Badge variant={v.id === d.id ? "default" : "muted"}>v{v.version}</Badge></Link>)}
          <DeclarationStatusBadge status={d.status} />
        </div>
      </div>

      <ol className="grid grid-cols-4 gap-2 text-[11px] sm:grid-cols-8">
        {flow.map((st) => (
          <li key={st} className={`rounded-md border px-2 py-1.5 text-center ${DECLARATION_STATUSES.indexOf(st) <= stepIndex && d.status !== "REJECTED" ? "border-primary/30 bg-primary/5 font-medium text-primary" : "text-muted-foreground"}`}>{t(`decl.status.${st}`)}</li>
        ))}
      </ol>

      {d.legalPending && <Alert variant="warning">{t("decl.legalPending")}{d.legalAcknowledgedById && <> {t("decl.acknowledgedBy", { name: users.get(d.legalAcknowledgedById) ?? "—" })}</>}</Alert>}
      {d.status === "REJECTED" && <Alert variant="error">{t("decl.rejectedInfo", { reason: d.rejectionReason ?? "—" })}</Alert>}
      {d.version > 1 && <Alert variant="info">{t("decl.supplementaryInfo", { version: d.version })}</Alert>}
      {s.mixedCurrencies && <Alert variant="error">{t("decl.mixedCurrencies")}</Alert>}

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label={t("decl.file.employees")} value={s.totals.employeeCount} />
        <Stat label={t("decl.file.taxable")} value={f.money(s.totals.taxable, d.currency)} />
        <Stat label={t("decl.file.wageTax")} value={f.money(s.totals.wageTax, d.currency)} />
        <Stat label={t("decl.file.aov")} value={f.money(s.totals.aov + s.totals.aovEmployer, d.currency)} />
        <Stat label={t("decl.file.previousAdjustments")} value={f.money(d.previousAdjustments, d.currency)} />
        <Stat label={t("decl.file.totalPayable")} value={f.money(d.totalPayable, d.currency)} className="border-primary/30 bg-primary/[0.03]" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>{t("decl.preview")}</CardTitle><CardDescription>{t("decl.previewSub", { tax: s.ruleSets.tax.join(", ") || "—", aov: s.ruleSets.aov.join(", ") || "—" })}</CardDescription></CardHeader>
          <Table>
            <THead><TR><TH>{t("decl.file.colNumber")}</TH><TH>{t("decl.file.colName")}</TH><TH className="text-right">{t("decl.file.colTaxable")}</TH><TH className="text-right">{t("decl.file.wageTaxRegular")}</TH><TH className="text-right">{t("decl.file.wageTaxSpecial")}</TH><TH className="text-right">{t("decl.file.wageTaxOvertime")}</TH><TH className="text-right">{t("decl.file.colAovBase")}</TH><TH className="text-right">{t("decl.file.colAov")}</TH></TR></THead>
            <TBody>
              {s.employees.map((e) => (
                <TR key={e.employeeId}>
                  <TD className="tabular">{e.number}</TD><TD>{e.name}{d.month === 0 && <span className="block text-xs text-muted-foreground">{t("decl.months", { count: e.months })}</span>}</TD>
                  <TD className="tabular text-right">{f.amount(e.taxable)}</TD><TD className="tabular text-right">{f.amount(e.wageTaxRegular)}</TD>
                  <TD className="tabular text-right">{f.amount(e.wageTaxSpecial)}</TD><TD className="tabular text-right">{f.amount(e.wageTaxOvertime)}</TD>
                  <TD className="tabular text-right">{f.amount(e.aovBase)}</TD><TD className="tabular text-right">{f.amount(e.aov + e.aovEmployer)}</TD>
                </TR>
              ))}
              <TR className="bg-muted/50 font-semibold">
                <TD /><TD>{t("common.total")}</TD><TD className="tabular text-right">{f.amount(s.totals.taxable)}</TD><TD className="tabular text-right">{f.amount(s.totals.wageTaxRegular)}</TD>
                <TD className="tabular text-right">{f.amount(s.totals.wageTaxSpecial)}</TD><TD className="tabular text-right">{f.amount(s.totals.wageTaxOvertime)}</TD>
                <TD className="tabular text-right">{f.amount(s.totals.aovBase)}</TD><TD className="tabular text-right">{f.amount(s.totals.aov + s.totals.aovEmployer)}</TD>
              </TR>
            </TBody>
          </Table>
          <CardContent className="pt-4 text-xs text-muted-foreground">{t("decl.snapshotAt", { date: f.dateTime(new Date(s.generatedAt)) })} · {s.runIds.map((r) => <Link key={r} className="text-primary hover:underline" href={`/app/payroll/${r}`}> {t("decl.viewRun")}</Link>)}</CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{t("decl.actions")}</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm">
              {canPrepare && actions.has("recalculate") && <ActionButton action={recalculateDeclarationAction} fields={fields} variant="outline" className="w-full">{t("decl.recalculate")}</ActionButton>}
              {canPrepare && actions.has("submitForReview") && <ActionButton action={submitForReviewAction} fields={fields} className="w-full">{t("decl.submitForReview")}</ActionButton>}
              {canApprove && actions.has("approve") && (
                <ActionForm notify="toast" action={approveDeclarationAction} className="space-y-3 rounded-lg border p-3">
                  <input type="hidden" name="id" value={d.id} />
                  <Field label={t("decl.fileLanguage")} htmlFor="fileLocale">
                    <Select id="fileLocale" name="fileLocale" defaultValue="nl"><option value="nl">Nederlands</option><option value="en">English</option></Select>
                  </Field>
                  {d.legalPending && <label className="flex items-start gap-2 text-xs"><input type="checkbox" name="acknowledgePending" className="mt-0.5" /> {t("decl.acknowledge")}</label>}
                  <SubmitButton className="w-full">{t("decl.approve")}</SubmitButton>
                </ActionForm>
              )}
              {canApprove && actions.has("returnToCalculated") && <ActionButton action={returnToCalculatedAction} fields={fields} variant="ghost" className="w-full">{t("decl.return")}</ActionButton>}
              {canApprove && d.files.length > 0 && actions.has("generate") && (
                <ActionForm notify="toast" action={regenerateFilesAction} className="flex items-end gap-2">
                  <input type="hidden" name="id" value={d.id} />
                  <Select name="fileLocale" defaultValue="nl" className="w-32" aria-label={t("decl.fileLanguage")}><option value="nl">NL</option><option value="en">EN</option></Select>
                  <SubmitButton variant="outline" size="sm">{t("decl.regenerate")}</SubmitButton>
                </ActionForm>
              )}
              {canApprove && actions.has("revokeApproval") && <ActionButton action={revokeApprovalAction} fields={fields} variant="ghost" className="w-full" confirm={t("decl.revokeConfirm")}>{t("decl.revoke")}</ActionButton>}

              {canPrepare && actions.has("recordSubmission") && (
                <ActionForm notify="toast" action={recordSubmissionAction} className="space-y-3 rounded-lg border p-3">
                  <p className="font-medium">{t("decl.recordSubmission")}</p>
                  <p className="text-xs text-muted-foreground">{t("decl.manualSubmission")}</p>
                  <input type="hidden" name="id" value={d.id} />
                  <Field label={t("decl.submittedAt")} htmlFor="submittedAt"><Input id="submittedAt" name="submittedAt" type="date" defaultValue={toDateInput(new Date())} /><FieldError name="submittedAt" /></Field>
                  <Field label={t("decl.reference")} htmlFor="reference"><Input id="reference" name="reference" /><FieldError name="reference" /></Field>
                  <Field label={t("decl.receipt")} htmlFor="receipt" hint={t("decl.receiptHint")}><Input id="receipt" name="receipt" type="file" accept=".pdf,.png,.jpg,.jpeg" className="py-1.5" /></Field>
                  <SubmitButton className="w-full">{t("decl.saveSubmission")}</SubmitButton>
                </ActionForm>
              )}
              {canPrepare && actions.has("recordAccepted") && (
                <div className="space-y-2 rounded-lg border p-3">
                  <p className="font-medium">{t("decl.recordOutcome")}</p>
                  <ActionButton action={recordOutcomeAction} fields={{ ...fields, outcome: "ACCEPTED" }} variant="accent" className="w-full">{t("decl.accepted")}</ActionButton>
                  <ActionForm notify="toast" action={recordOutcomeAction} className="space-y-2">
                    <input type="hidden" name="id" value={d.id} /><input type="hidden" name="outcome" value="REJECTED" />
                    <Textarea name="reason" placeholder={t("decl.rejectionReason")} aria-label={t("decl.rejectionReason")} /><FieldError name="reason" />
                    <SubmitButton variant="outline" className="w-full">{t("decl.rejected")}</SubmitButton>
                  </ActionForm>
                </div>
              )}
              {canPrepare && actions.has("recordPayment") && (
                <ActionForm notify="toast" action={recordPaymentAction} className="space-y-3 rounded-lg border p-3">
                  <p className="font-medium">{t("decl.recordPayment")}</p>
                  <input type="hidden" name="id" value={d.id} />
                  <Field label={t("decl.paidAt")} htmlFor="paidAt"><Input id="paidAt" name="paidAt" type="date" defaultValue={toDateInput(new Date())} /><FieldError name="paidAt" /></Field>
                  <Field label={t("decl.paymentReference")} htmlFor="paymentRef"><Input id="paymentRef" name="reference" /></Field>
                  <SubmitButton className="w-full">{t("decl.savePayment")}</SubmitButton>
                </ActionForm>
              )}
              {canPrepare && actions.has("createSupplementary") && versions.at(-1)?.id === d.id && <ActionButton action={createSupplementaryAction} fields={fields} variant="outline" className="w-full" confirm={t("decl.supplementaryConfirm")}>{t("decl.createSupplementary")}</ActionButton>}
              {d.submittedAt && <p className="text-xs text-muted-foreground">{t("decl.submittedInfo", { date: f.date(d.submittedAt), reference: d.submissionReference ?? "—" })}{d.receiptFileName && <> · <a className="text-primary hover:underline" href={`/api/declarations/${d.id}/receipt`}>{d.receiptFileName}</a></>}</p>}
              {d.paidAt && <p className="text-xs text-muted-foreground">{t("decl.paidInfo", { date: f.date(d.paidAt), reference: d.paymentReference ?? "—" })}</p>}
              {d.approvedAt && <p className="text-xs text-muted-foreground">{t("decl.approvedInfo", { name: users.get(d.approvedById ?? "") ?? "—", date: f.dateTime(d.approvedAt) })}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t("decl.files")}</CardTitle><CardDescription>{d.files.length ? t("decl.filesSub") : t("decl.noFiles")}</CardDescription></CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              {d.files.map((file) => (
                <a key={file.id} href={`/api/declarations/files/${file.id}`} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 hover:bg-muted">
                  <span className="flex min-w-0 items-center gap-2">{file.format === "PDF" ? <FileText className="h-4 w-4 shrink-0 text-destructive" /> : <FileSpreadsheet className="h-4 w-4 shrink-0 text-success" />}<span className="truncate">{file.fileName}</span></span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">{file.downloadCount > 0 && `${file.downloadCount}×`}<Download className="h-3.5 w-3.5" /></span>
                </a>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>{t("decl.history")}</CardTitle></CardHeader>
        <Table>
          <THead><TR><TH>{t("audit.cols.when")}</TH><TH>{t("audit.cols.user")}</TH><TH>{t("decl.transition")}</TH><TH>{t("decl.note")}</TH></TR></THead>
          <TBody>
            {d.events.map((e) => (
              <TR key={e.id}>
                <TD className="tabular whitespace-nowrap">{f.dateTime(e.createdAt)}</TD>
                <TD>{e.userId ? users.get(e.userId) ?? "—" : t("audit.system")}</TD>
                <TD>{e.fromStatus ? <>{t(`decl.status.${e.fromStatus}`)} → </> : null}<strong>{t(`decl.status.${e.toStatus}`)}</strong></TD>
                <TD className="text-xs text-muted-foreground">{e.note === "auto" ? t("decl.autoPrepared") : e.note}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
