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
import { newSchemeVersionAction } from "@/app/actions/contributions";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("settings.tabs.contributions") };
}

const minor = (v: number) => (v ? (v / 100).toFixed(2) : "");
const pct = (bp: number) => (bp ? String(bp / 100) : "");

export default async function SchemePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ type?: string; version?: string }> }) {
  const ctx = await requirePage("settings.manage");
  const { t, locale } = await getI18n();
  const { id } = await params;
  const sp = await searchParams;
  const s = id === "new" ? null : await db.contributionScheme.findFirst({ where: { id, companyId: ctx.company.id } });
  if (id !== "new" && !s) notFound();
  const type = (s?.type ?? (["HEALTH", "PENSION", "FVO"].includes(sp.type ?? "") ? sp.type : "HEALTH")) as ContributionType;
  const def = DEFAULT_SCHEMES.find((d) => d.type === type)!;
  const currencies = await getCurrencies();
  const canVerify = ctx.role === "OWNER" || ctx.role === "ADMIN";

  return (
    <div className="space-y-6">
      <Link href="/app/settings/contributions" className={buttonVariants({ variant: "ghost" })}><ArrowLeft /> {t("contrib.back")}</Link>
      {sp.version && <Alert variant="success">{t("contrib.versionCreated")}</Alert>}
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
              id: s?.id, type, name: s?.name ?? (locale === "en" ? def.nameEn : def.nameNl), basis: s?.basis ?? def.basis, method: s?.method ?? "PERCENTAGE",
              base: s?.base ?? def.base, employeeRate: pct(s?.employeeRateBp ?? 0), employerRate: pct(s?.employerRateBp ?? 0),
              employeeAmount: minor(s?.employeeAmount ?? 0), employerAmount: minor(s?.employerAmount ?? 0), maxBase: s?.maxBaseMonthly ? minor(s.maxBaseMonthly) : "",
              currency: s?.currency ?? ctx.company.currency, effectiveFrom: toDateInput(s?.effectiveFrom ?? new Date()), effectiveTo: s?.effectiveTo ? toDateInput(s.effectiveTo) : "",
              isActive: s?.isActive ?? false, appliesToAll: s?.appliesToAll ?? true, employeeTax: s?.employeeTax ?? def.employeeTax, showOnPayslip: s?.showOnPayslip ?? true,
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
