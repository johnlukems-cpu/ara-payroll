import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { getCurrencies } from "@/lib/server/rates";
import { toDateInput } from "@/lib/format";
import { DEFAULT_SCHEMES, type ContributionType } from "@/lib/payroll/contributions";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { SchemeForm } from "@/components/scheme-form";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { approveSchemeAction, deactivateSchemeAction, newSchemeVersionAction, setSchemeApplicabilityAction } from "@/app/actions/contributions";
import { schemeIssues, schemeState } from "@/lib/payroll/contributions";
import { ActionButton } from "@/components/confirm-button";
import { FieldError } from "@/components/action-form";
import { IssueList, StateBadge } from "../status";
import { LEGAL_SOURCE_FOR_TYPE } from "@/lib/contribution-format";
import { LegalBadge } from "@/components/legal-badge";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("settings.tabs.contributions") };
}

const minor = (v: number) => (v ? (v / 100).toFixed(2) : "");
const pct = (bp: number) => (bp ? String(bp / 100) : "");

export default async function SchemePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ type?: string; version?: string }> }) {
  const ctx = await requirePage("settings.manage");
  const { t, f, locale } = await getI18n();
  const { id } = await params;
  const sp = await searchParams;
  const s = id === "new" ? null : await db.contributionScheme.findFirst({ where: { id, companyId: ctx.company.id } });
  if (id !== "new" && !s) notFound();
  const type = (s?.type ?? (["HEALTH", "PENSION", "FVO"].includes(sp.type ?? "") ? sp.type : "HEALTH")) as ContributionType;
  const def = DEFAULT_SCHEMES.find((d) => d.type === type)!;
  const currencies = await getCurrencies();
  const canVerify = ctx.role === "OWNER" || ctx.role === "ADMIN";
  const tt = t as unknown as (k: string, v?: Record<string, string | number>) => string;
  const state = s ? schemeState(s, new Date()) : null;
  const issues = s ? schemeIssues(s) : [];
  const legal = await db.legalSource.findUnique({ where: { code: LEGAL_SOURCE_FOR_TYPE[type] } });
  const approver = s?.approvedById ? await db.user.findUnique({ where: { id: s.approvedById }, select: { name: true } }) : null;

  return (
    <div className="space-y-6">
      <Link href="/app/settings/contributions" className={buttonVariants({ variant: "ghost" })}><ArrowLeft /> {t("contrib.back")}</Link>
      {sp.version && <Alert variant="success">{t("contrib.versionCreated")}</Alert>}
      {s && (
        <Card data-testid="scheme-status">
          <CardHeader className="flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>{t("contrib.statusTitle")}</CardTitle>
              <CardDescription>{t("contrib.statusSub")}</CardDescription>
            </div>
            <StateBadge state={state!} t={tt} />
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <IssueList issues={issues} t={tt} />
            {s.approvedAt && <p className="text-xs text-muted-foreground">{t("contrib.approvedBy", { date: f.date(s.approvedAt), name: approver?.name ?? "—" })}</p>}
            {s.notApplicable && <p className="text-xs">{t("contrib.notApplicableReason", { reason: s.notApplicableReason ?? "—" })}</p>}
            <div className="flex flex-wrap items-start gap-3">
              {!s.notApplicable && !s.isActive && (canVerify
                ? <ActionButton action={approveSchemeAction} fields={{ id: s.id }} confirm={t("contrib.approveConfirm")}>{t("contrib.approve")}</ActionButton>
                : <p className="text-xs text-muted-foreground">{t("contrib.approveOnlyAdmin")}</p>)}
              {s.isActive && <ActionButton action={deactivateSchemeAction} fields={{ id: s.id }} variant="outline" confirm={t("contrib.deactivateConfirm")}>{t("contrib.deactivate")}</ActionButton>}
              {canVerify && s.notApplicable && <ActionButton action={setSchemeApplicabilityAction} fields={{ id: s.id, notApplicable: "false" }} variant="outline">{t("contrib.markApplicable")}</ActionButton>}
            </div>
            {canVerify && !s.notApplicable && !s.isActive && (
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-medium">{t("contrib.markNotApplicable")}</summary>
                <ActionForm action={setSchemeApplicabilityAction} notify="toast" className="mt-3 flex flex-wrap items-end gap-3">
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="notApplicable" value="true" />
                  <label className="flex min-w-64 flex-1 flex-col gap-1.5 text-sm font-medium">{t("contrib.reason")}<Input name="reason" maxLength={300} placeholder={t("contrib.reasonPlaceholder")} /><FieldError name="reason" /></label>
                  <SubmitButton variant="outline">{t("contrib.markNotApplicableSubmit")}</SubmitButton>
                </ActionForm>
                <p className="mt-2 text-xs text-muted-foreground">{t("contrib.notApplicableHint")}</p>
              </details>
            )}
          </CardContent>
        </Card>
      )}
      {legal && (
        <Card data-testid="scheme-legal">
          <CardHeader className="flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div><CardTitle>{t("contrib.legalBasisTitle")}</CardTitle><CardDescription>{legal.publication}</CardDescription></div>
            <LegalBadge status={legal.verificationStatus} />
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{legal.summary}</p>
            {legal.notes && <p className="text-xs text-muted-foreground">{legal.notes}</p>}
            {legal.verificationStatus !== "VERIFIED" && <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">{t("contrib.statutoryNeedsVerification")}</p>}
            <Link href={`/app/tax/legal#${legal.code}`} className="text-xs text-primary hover:underline">{t("contrib.seeLegalSources")}</Link>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{s ? s.name : t("contrib.newSchemeFor", { type: t(`enums.contributionType.${type}`) })}</CardTitle>
          <CardDescription>{t(`contrib.typeHint.${type}`)}</CardDescription>
        </CardHeader>
        <CardContent>
          <SchemeForm
            canVerify={canVerify}
            currencies={currencies}
            v={{
              id: s?.id, type, name: s?.name ?? (locale === "en" ? def.nameEn : def.nameNl), basis: s?.basis ?? def.basis, method: s?.method ?? def.method,
              base: s?.base ?? def.base, employeeRate: pct(s?.employeeRateBp ?? 0), employerRate: pct(s?.employerRateBp ?? 0),
              employeeAmount: minor(s?.employeeAmount ?? 0), employerAmount: minor(s?.employerAmount ?? 0), maxBase: s?.maxBaseMonthly ? minor(s.maxBaseMonthly) : "", minBase: s?.minBaseMonthly ? minor(s.minBaseMonthly) : "",
              currency: s?.currency ?? ctx.company.currency, effectiveFrom: toDateInput(s?.effectiveFrom ?? new Date()), effectiveTo: s?.effectiveTo ? toDateInput(s.effectiveTo) : "",
              isActive: s?.isActive ?? false, approved: !!s?.approvedAt, appliesToAll: s?.appliesToAll ?? true, employeeTax: s?.employeeTax ?? def.employeeTax, showOnPayslip: s?.showOnPayslip ?? true,
              legalStatus: s?.legalStatus ?? def.legalStatus, legalReference: s?.legalReference ?? def.legalReference, notes: s?.notes ?? "",
            }}
          />
        </CardContent>
      </Card>
      {s && (
        <Card>
          <CardHeader><CardTitle>{t("contrib.versionTitle")}</CardTitle><CardDescription>{t("contrib.versionSub")}</CardDescription></CardHeader>
          <CardContent>
            <ActionForm action={newSchemeVersionAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={s.id} />
              <label className="flex flex-col gap-1.5 text-sm font-medium">{t("contrib.f.effectiveFrom")}<Input type="date" name="effectiveFrom" className="w-44" /></label>
              <SubmitButton variant="outline">{t("contrib.newVersion")}</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
