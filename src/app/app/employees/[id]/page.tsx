import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { findRate, getCurrencies } from "@/lib/server/rates";
import { findRuleSet } from "@/lib/payroll/service";
import { parentalEntitlements } from "@/lib/server/leave-balance";
import { LegalBadge } from "@/components/legal-badge";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { ActionForm } from "@/components/action-form";
import { ActionButton } from "@/components/confirm-button";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { Alert, EmptyState, PageHeader } from "@/components/ui/misc";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  addContractAction, archiveEmployeeAction, archiveDocumentAction, deleteDocumentAction, enableSelfServiceAction, reactivateEmployeeAction, updateEmployeeAction, uploadDocumentAction,
} from "@/app/actions/employees";
import { OpField, OpForm } from "@/components/admin-op-form";
import { ContractFields, EmployeeFields } from "../fields";
import { EmployeeComponentsTab } from "./components-tab";

const TABS = ["details", "contracts", "pay", "payslips", "leave", "parental", "documents"] as const;

export default async function EmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; created?: string }> }) {
  const ctx = await requirePage("employees.view");
  const { t, f } = await getI18n();
  const { id } = await params;
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? sp.tab! : "details";
  const canEdit = can(ctx.role, "employees.edit");
  const canSalary = can(ctx.role, "employees.viewSalary");

  const e = await db.employee.findFirst({
    where: { id, companyId: ctx.company.id },
    include: {
      department: true,
      contracts: { orderBy: { startDate: "desc" } },
      components: { include: { component: true }, orderBy: [{ isActive: "desc" }, { startDate: "desc" }] },
      documents: { orderBy: { createdAt: "desc" } },
      leaveRequests: { include: { leaveType: true }, orderBy: { startDate: "desc" }, take: 50 },
      payslips: { include: { run: true }, orderBy: [{ run: { year: "desc" } }, { run: { month: "desc" } }], take: 36 },
    },
  });
  if (!e) notFound();
  const canDelete = can(ctx.role, "company.manage");
  const DOC_CATEGORIES = ["EMPLOYMENT_CONTRACT", "ADDENDUM", "IDENTITY", "DIPLOMA", "CERTIFICATE", "BANK", "TAX", "PENSION", "LEAVE", "OTHER"] as const;
  const [docHistory, uploaders] = tab === "documents"
    ? await Promise.all([
        db.auditLog.findMany({ where: { companyId: ctx.company.id, entity: "Employee", entityId: e.id, action: { in: ["document.upload", "document.view", "document.download", "document.archive", "document.restore", "document.delete"] } }, orderBy: { createdAt: "desc" }, take: 50, include: { user: { select: { name: true } } } }),
        db.user.findMany({ where: { id: { in: e.documents.map((d) => d.uploadedBy ?? "").filter(Boolean) } }, select: { id: true, name: true } }).then((us) => new Map(us.map((u) => [u.id, u.name]))),
      ])
    : [[], new Map<string, string>()] as const;
  const visibleTabs = TABS.filter((x) => canSalary || !["contracts", "pay", "payslips"].includes(x));
  const current = e.contracts[0];
  const currencies = await getCurrencies();
  const art17aAvailable = !!(await db.taxRuleSet.findFirst({ where: { regime: "ART17A", verificationStatus: "VERIFIED", approvalStatus: "APPROVED", OR: [{ companyId: ctx.company.id }, { companyId: null }] } }));
  const parental = tab === "parental" ? await parentalEntitlements(ctx.company.id, e.id) : [];

  // Salary overview: salary currency vs statutory calculation currency and payment currency.
  const ruleSet = canSalary ? await findRuleSet(ctx.company.id, new Date()) : null;
  const calcCur = ruleSet?.currency ?? "SRD";
  const salaryCur = current?.salaryCurrency ?? ctx.company.currency;
  const payCur = e.paymentCurrency ?? salaryCur;
  const policy = { companyId: ctx.company.id, allowApi: ctx.company.rateAllowApi };
  const ratePairs = canSalary && current ? [...new Set([`${salaryCur}>${calcCur}`, `${calcCur}>${payCur}`])].filter((p) => p.split(">")[0] !== p.split(">")[1]) : [];
  const rates = await Promise.all(ratePairs.map(async (p) => {
    const [from, to] = p.split(">");
    return { from, to, rate: await findRate(from, to, new Date(), policy) };
  }));

  return (
    <div>
      <PageHeader
        title={`${e.firstName} ${e.lastName}`}
        description={`#${e.employeeNumber} · ${e.jobTitle ?? t("employee.noJobTitle")}${e.department ? ` · ${e.department.name}` : ""}`}
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status={e.status} />
            {e.userId ? <Badge variant="accent">{t("employee.selfServiceEnabled")}</Badge> : can(ctx.role, "users.manage") && <ActionButton action={enableSelfServiceAction} fields={{ employeeId: e.id }} variant="outline" size="sm">{t("employee.enableSelfService")}</ActionButton>}
          </div>
        }
      />
      {sp.created && <Alert variant="success" className="mb-4">{t("employees.created")}</Alert>}
      {canEdit && e.status === "TERMINATED" && (
        <Alert variant="warning" className="mb-4">
          <span className="flex flex-wrap items-center justify-between gap-3" data-testid="employee-archived">
            {t("employee.archivedNotice", { date: f.date(e.terminationDate) })}
            <ActionButton action={reactivateEmployeeAction} fields={{ id: e.id }} size="sm" data-testid="employee-reactivate">{t("employee.reactivate")}</ActionButton>
          </span>
        </Alert>
      )}

      {canSalary && current && (
        <Card className="mb-6">
          <CardContent className="grid gap-4 pt-5 text-sm sm:grid-cols-2 lg:grid-cols-5">
            <div><p className="text-muted-foreground">{t("employee.salary")}</p><p className="tabular font-semibold">{current.payType === "HOURLY" ? f.money(current.hourlyRate, salaryCur) : f.money(current.baseSalary, salaryCur)}</p></div>
            <div><p className="text-muted-foreground">{t("employee.contract.salaryCurrency")}</p><p className="font-semibold">{salaryCur}</p></div>
            <div><p className="text-muted-foreground">{t("employee.frequency")}</p><p className="font-semibold">{t(`enums.frequency.${current.payType}` as never)}</p></div>
            <div><p className="text-muted-foreground">{t("employee.paymentCurrency")}</p><p className="font-semibold">{payCur}</p></div>
            <div>
              <p className="text-muted-foreground">{t("employee.exchangeRate")}</p>
              {rates.length === 0 ? <p className="font-semibold">{t("employee.noConversion")}</p> : rates.map((r) => (
                r.rate
                  ? <p key={r.from + r.to} className="tabular font-semibold">{t("employee.rateLine", { from: r.from, to: r.to, rate: f.rate(r.rate.rate), date: f.date(r.rate.date) })}</p>
                  : <p key={r.from + r.to} className="text-xs text-destructive">{t("employee.rateMissing", { from: r.from, to: r.to })}</p>
              ))}
            </div>
            <p className="text-xs text-muted-foreground lg:col-span-5">{t("employee.statutoryNote", { currency: calcCur })}</p>
          </CardContent>
        </Card>
      )}

      <div className="mb-6 flex gap-1 overflow-x-auto border-b">
        {visibleTabs.map((x) => (
          <Link key={x} href={`?tab=${x}`} className={cn("-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm", tab === x ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t(`employee.tabs.${x}`)}
          </Link>
        ))}
      </div>

      {tab === "details" && (
        canEdit ? (
          <ActionForm action={updateEmployeeAction} className="space-y-5">
            <input type="hidden" name="id" value={e.id} />
            <EmployeeFields e={e} currencies={currencies} art17aAvailable={art17aAvailable} departments={await db.department.findMany({ where: { companyId: ctx.company.id }, orderBy: { name: "asc" } })} showStatus />
            <div className="flex justify-end"><SubmitButton>{t("common.saveChanges")}</SubmitButton></div>
          </ActionForm>
        ) : null
      )}
      {tab === "details" && canEdit && e.status !== "TERMINATED" && (
        <div className="mt-6 max-w-xl">
          <OpForm action={archiveEmployeeAction} title={t("employee.archiveTitle")} submit={t("employee.archive")} hidden={{ id: e.id }} variant="destructive" testId="employee-archive">
            <OpField label={t("employee.terminationDate")}><Input name="terminationDate" type="date" required /></OpField>
            <OpField label={t("employee.archiveReason")}><Input name="reason" /></OpField>
            <p className="text-xs text-muted-foreground sm:col-span-2">{t("employee.archiveHint")}</p>
          </OpForm>
        </div>
      )}
      {tab === "details" && !canEdit && (
        (
          <Card><CardContent className="grid gap-4 pt-5 text-sm sm:grid-cols-3">
            {([[t("employee.idNumber"), e.idNumber], [t("employee.dateOfBirth"), f.date(e.dateOfBirth)], [t("employee.email"), e.email], [t("employee.phone"), e.phone], [t("employee.district"), e.district], [t("employee.hireDate"), f.date(e.hireDate)], [t("employee.children_short"), e.numberOfChildren]] as const).map(([k, v]) => (
              <div key={k}><p className="text-muted-foreground">{k}</p><p className="font-medium">{v ?? "—"}</p></div>
            ))}
          </CardContent></Card>
        )
      )}

      {tab === "contracts" && canSalary && (
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{t("employee.contractsTitle")}</CardTitle><CardDescription>{t("employee.contractsSub")}</CardDescription></CardHeader>
            <Table>
              <THead><TR><TH>{t("employee.contractCols.effective")}</TH><TH>{t("employee.contractCols.ends")}</TH><TH>{t("employee.contractCols.type")}</TH><TH>{t("employee.contractCols.pay")}</TH><TH className="text-right">{t("employee.contractCols.amount")}</TH><TH>{t("employee.contractCols.hours")}</TH><TH>{t("employee.contractCols.pension")}</TH></TR></THead>
              <TBody>
                {e.contracts.map((c) => (
                  <TR key={c.id}>
                    <TD className="tabular">{f.date(c.startDate)} {c.id === current?.id && <Badge variant="success" className="ml-1">{t("employee.current")}</Badge>}</TD>
                    <TD className="tabular">{f.date(c.endDate)}</TD>
                    <TD>{t(`enums.contractType.${c.contractType}`)}</TD>
                    <TD>{t(`enums.payType.${c.payType}`)}</TD>
                    <TD className="tabular text-right">{c.payType === "HOURLY" ? `${f.money(c.hourlyRate, c.salaryCurrency)}${t("common.perHour")}` : `${f.money(c.baseSalary, c.salaryCurrency)} ${t(`enums.frequency.${c.payType}`)}`}</TD>
                    <TD>{c.hoursPerWeek}</TD>
                    <TD>{f.pct(c.pensionEmployeeBp)} / {f.pct(c.pensionEmployerBp)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          {canEdit && (
            <Card>
              <CardHeader><CardTitle>{t("employee.newContract")}</CardTitle><CardDescription>{t("employee.newContractSub")}</CardDescription></CardHeader>
              <CardContent>
                <ActionForm action={addContractAction} className="space-y-4" resetOnSuccess>
                  <input type="hidden" name="employeeId" value={e.id} />
                  <ContractFields c={current} currencies={currencies} defaultCurrency={ctx.company.currency} />
                  <div className="flex justify-end"><SubmitButton>{t("employee.saveContract")}</SubmitButton></div>
                </ActionForm>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === "pay" && canSalary && (
        <EmployeeComponentsTab employeeId={e.id} companyId={ctx.company.id} assignments={e.components} contract={current} currencies={currencies} salaryCur={salaryCur} canEdit={canEdit} canManageSchemes={can(ctx.role, "settings.manage")} />
      )}

      {tab === "payslips" && canSalary && (
        <Card>
          {e.payslips.length === 0 ? <EmptyState title={t("employee.noPayslips")} /> : (
            <Table>
              <THead><TR><TH>{t("employee.payslipCols.period")}</TH><TH>{t("employee.payslipCols.runStatus")}</TH><TH className="text-right">{t("employee.payslipCols.gross")}</TH><TH className="text-right">{t("employee.payslipCols.wageTax")}</TH><TH className="text-right">{t("employee.payslipCols.aov")}</TH><TH className="text-right">{t("employee.payslipCols.net")}</TH><TH className="text-right">{t("employee.payslipCols.netPaid")}</TH><TH /></TR></THead>
              <TBody>
                {e.payslips.map((p) => (
                  <TR key={p.id}>
                    <TD>{f.period(p.run.year, p.run.month)}</TD>
                    <TD><StatusBadge status={p.run.status} /></TD>
                    <TD className="tabular text-right">{f.money(p.grossPay, p.calcCurrency)}</TD>
                    <TD className="tabular text-right">{f.money(p.wageTax, p.calcCurrency)}</TD>
                    <TD className="tabular text-right">{f.money(p.aov, p.calcCurrency)}</TD>
                    <TD className="tabular text-right">{f.money(p.netPay, p.calcCurrency)}</TD>
                    <TD className="tabular text-right font-medium">{f.money(p.netPayPayment, p.paymentCurrency)}</TD>
                    <TD className="text-right"><Link className="text-primary hover:underline" href={`/app/payslips/${p.id}`}>{t("common.view")}</Link></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      )}

      {tab === "leave" && (
        <Card>
          {e.leaveRequests.length === 0 ? <EmptyState title={t("employee.noLeave")} /> : (
            <Table>
              <THead><TR><TH>{t("employee.leaveCols.type")}</TH><TH>{t("employee.leaveCols.from")}</TH><TH>{t("employee.leaveCols.to")}</TH><TH className="text-right">{t("employee.leaveCols.days")}</TH><TH>{t("employee.leaveCols.status")}</TH></TR></THead>
              <TBody>
                {e.leaveRequests.map((l) => (
                  <TR key={l.id}><TD>{l.leaveType.name}</TD><TD className="tabular">{f.date(l.startDate)}</TD><TD className="tabular">{f.date(l.endDate)}</TD><TD className="tabular text-right">{f.number(l.days)}</TD><TD><StatusBadge status={l.status} /></TD></TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      )}

      {tab === "parental" && (
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{t("parental.entitlements")}</CardTitle><CardDescription>{t("parental.entitlementsSub")}</CardDescription></CardHeader>
            <Table>
              <THead><TR><TH>{t("parental.cols.type")}</TH><TH className="text-right">{t("parental.cols.statutory")}</TH><TH className="text-right">{t("parental.cols.companyExtra")}</TH><TH>{t("parental.cols.usage")}</TH><TH>{t("parental.cols.legal")}</TH></TR></THead>
              <TBody>
                {parental.map((p) => (
                  <TR key={p.type.id}>
                    <TD className="font-medium">{p.type.name}</TD>
                    <TD className="tabular text-right">{p.statutory ? t("parental.days", { days: f.number(p.statutory) }) : "—"}</TD>
                    <TD className="tabular text-right">{p.companyExtra ? t("parental.days", { days: f.number(p.companyExtra) }) : "—"}</TD>
                    <TD className="text-xs">{p.perChild.length ? p.perChild.map((c) => <div key={c.child}>{c.child !== "—" ? t("parental.child", { date: f.date(c.child) }) : "—"}: {t("parental.usedRemaining", { used: f.number(c.used), remaining: c.remaining != null ? f.number(c.remaining) : "—" })}</div>) : "—"}</TD>
                    <TD><LegalBadge status={p.type.legalStatus} /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Card>
            <CardHeader className="flex-row items-center justify-between"><CardTitle>{t("parental.requests")}</CardTitle><Link href="/app/leave/parental" className="text-sm text-primary hover:underline">{t("parental.manage")}</Link></CardHeader>
            {e.leaveRequests.filter((l) => ["PARENTAL", "MATERNITY", "PATERNITY", "ADOPTION"].includes(l.leaveType.category)).length === 0 ? <EmptyState title={t("parental.none")} /> : (
              <Table>
                <THead><TR><TH>{t("parental.cols.type")}</TH><TH>{t("parental.f.childBirthDate")}</TH><TH>{t("leave.cols.period")}</TH><TH className="text-right">{t("parental.f.days")}</TH><TH className="text-right">{t("parental.f.approvedDays")}</TH><TH>{t("parental.f.paymentStatus")}</TH><TH>{t("leave.cols.status")}</TH></TR></THead>
                <TBody>
                  {e.leaveRequests.filter((l) => ["PARENTAL", "MATERNITY", "PATERNITY", "ADOPTION"].includes(l.leaveType.category)).map((l) => (
                    <TR key={l.id}>
                      <TD>{l.leaveType.name}</TD><TD className="tabular">{f.date(l.childBirthDate)}</TD>
                      <TD className="tabular whitespace-nowrap">{f.date(l.startDate)} – {f.date(l.endDate)}</TD>
                      <TD className="tabular text-right">{f.number(l.days)}{l.schedulePercentBp < 10000 && ` (${f.pct(l.schedulePercentBp)})`}</TD>
                      <TD className="tabular text-right">{l.approvedDays != null ? f.number(l.approvedDays) : "—"}</TD>
                      <TD className="text-xs">{t(`parental.payment.${l.paymentStatus}`)}</TD>
                      <TD><StatusBadge status={l.status} /></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </div>
      )}

      {tab === "documents" && (
        <div className="space-y-6">
          {[false, true].map((archived) => {
            const docs = e.documents.filter((d) => !!d.archivedAt === archived);
            if (archived && docs.length === 0) return null;
            return (
              <Card key={String(archived)} data-testid={archived ? "documents-archived" : "documents-active"}>
                {archived && <CardHeader><CardTitle>{t("employee.docArchive")}</CardTitle></CardHeader>}
                {docs.length === 0 ? <EmptyState title={t("employee.noDocuments")} description={t("employee.noDocumentsText")} /> : (
                  <Table>
                    <THead><TR><TH>{t("employee.docCols.file")}</TH><TH>{t("employee.docCols.category")}</TH><TH>{t("employee.docCols.size")}</TH><TH>{t("employee.docCols.uploaded")}</TH><TH /></TR></THead>
                    <TBody>
                      {docs.map((d) => (
                        <TR key={d.id} data-testid={`doc-${d.fileName}`}>
                          <TD><span className="font-medium">{d.fileName}</span>{d.description && <span className="block text-xs text-muted-foreground">{d.description}</span>}</TD>
                          <TD><Badge variant="muted">{t(`enums.documentCategory.${d.category}`)}</Badge></TD>
                          <TD className="tabular">{f.number(d.size / 1024, 0)} KB</TD>
                          <TD className="tabular text-xs">{f.date(d.createdAt)}<span className="block text-muted-foreground">{uploaders.get(d.uploadedBy ?? "") ?? "—"}</span></TD>
                          <TD className="whitespace-nowrap text-right">
                            <span className="inline-flex flex-wrap items-center justify-end gap-1">
                              {["application/pdf", "image/png", "image/jpeg"].includes(d.mimeType) && <a className="px-2 text-sm text-primary hover:underline" href={`/api/documents/${d.id}?view=1`} target="_blank" rel="noopener noreferrer">{t("employee.docView")}</a>}
                              <a className="px-2 text-sm text-primary hover:underline" href={`/api/documents/${d.id}`}>{t("employee.docDownload")}</a>
                              {canEdit && <ActionButton action={archiveDocumentAction} fields={archived ? { id: d.id, restore: "1" } : { id: d.id }} variant="ghost" size="sm">{t(archived ? "employee.docRestore" : "employee.docArchiveAction")}</ActionButton>}
                              {canDelete && <ActionButton action={deleteDocumentAction} fields={{ id: d.id }} variant="ghost" size="sm" confirm={t("employee.deleteDocConfirm")}>{t("common.delete")}</ActionButton>}
                            </span>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </Card>
            );
          })}
          {canEdit && (
            <Card>
              <CardHeader><CardTitle>{t("employee.uploadTitle")}</CardTitle><CardDescription>{t("employee.uploadHint")}</CardDescription></CardHeader>
              <CardContent>
                <ActionForm action={uploadDocumentAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end" resetOnSuccess>
                  <input type="hidden" name="employeeId" value={e.id} />
                  <label className="space-y-1 text-sm"><span className="text-xs text-muted-foreground">{t("employee.docCols.category")}</span>
                    <Select name="category" defaultValue="OTHER" aria-label={t("employee.docCols.category")}>{DOC_CATEGORIES.map((c) => <option key={c} value={c}>{t(`enums.documentCategory.${c}`)}</option>)}</Select>
                  </label>
                  <label className="space-y-1 text-sm"><span className="text-xs text-muted-foreground">{t("employee.docDescription")}</span><Input name="description" maxLength={200} /></label>
                  <Input type="file" name="file" accept=".pdf,.png,.jpg,.jpeg,.docx" className="py-1.5" aria-label={t("employee.file")} />
                  <SubmitButton pendingText={t("employee.uploading")}>{t("employee.upload")}</SubmitButton>
                </ActionForm>
              </CardContent>
            </Card>
          )}
          {docHistory.length > 0 && (
            <Card>
              <CardHeader><CardTitle>{t("employee.docHistory")}</CardTitle></CardHeader>
              <Table data-testid="documents-history">
                <TBody>
                  {docHistory.map((h) => (
                    <TR key={h.id}>
                      <TD className="whitespace-nowrap text-xs">{f.dateTime(h.createdAt)}</TD>
                      <TD className="text-sm">{t(`employee.docEvent.${h.action.slice(9)}` as never)}</TD>
                      <TD className="text-sm">{(h.details as { fileName?: string } | null)?.fileName ?? "—"}</TD>
                      <TD className="text-xs text-muted-foreground">{h.user?.name ?? "—"}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
