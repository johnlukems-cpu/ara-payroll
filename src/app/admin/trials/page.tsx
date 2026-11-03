import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/server/admin-page";
import { getI18n } from "@/lib/server/i18n";
import { saasSettings } from "@/lib/server/saas";
import { trialDaysLeft } from "@/lib/saas";
import { runProcessingAction, subscriptionAction } from "@/app/actions/admin";
import { ActionButton } from "@/components/confirm-button";
import { OpField, OpForm } from "@/components/admin-op-form";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("saas.nav.trials") };
}

/**
 * All trial periods: running ones (with remaining days, extend / convert) and ended ones with their conversion result.
 * Conversion: CONVERTED when the subscription continued as a paid subscription (TRIAL_CONVERTED event), otherwise by status.
 */
export default async function TrialsPage() {
  await requireAdminPage();
  const { t, f, locale } = await getI18n();
  const now = new Date();
  const [subs, settings] = await Promise.all([
    db.subscription.findMany({ where: { trialStart: { not: null } }, orderBy: { trialEnd: "asc" }, include: { plan: true, organization: { select: { id: true, name: true } }, events: { where: { type: { in: ["TRIAL_CONVERTED", "TRIAL_REMINDER", "TRIAL_EXTENDED"] } }, select: { type: true, createdAt: true } } } }),
    saasSettings(),
  ]);
  const conversion = (s: (typeof subs)[number]) =>
    s.status === "TRIAL" ? "RUNNING" : s.events.some((e) => e.type === "TRIAL_CONVERTED") || ["ACTIVE", "PAST_DUE"].includes(s.status) ? "CONVERTED" : s.status === "EXPIRED" ? "EXPIRED" : "ENDED";
  const running = subs.filter((s) => s.status === "TRIAL");
  const ended = subs.filter((s) => s.status !== "TRIAL").reverse();
  const variant = { RUNNING: "default", CONVERTED: "success", EXPIRED: "warning", ENDED: "muted" } as const;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("saas.trials.title")}
        description={t("saas.trials.subtitle", { days: settings.trialReminderDays })}
        actions={<ActionButton action={runProcessingAction} variant="secondary" data-testid="run-processing">{t("saas.trials.process")}</ActionButton>}
      />
      <Card>
        {running.length === 0 ? <EmptyState title={t("saas.trials.noneRunning")} /> : (
          <Table>
            <THead><TR><TH>{t("saas.customers.cols.company")}</TH><TH>{t("saas.customers.cols.plan")}</TH><TH>{t("saas.sub.start")}</TH><TH>{t("saas.sub.trialEnd")}</TH><TH className="text-right">{t("saas.trials.daysLeft")}</TH><TH>{t("saas.trials.reminder")}</TH><TH /></TR></THead>
            <TBody>
              {running.map((s) => {
                const left = trialDaysLeft(s.trialEnd, now) ?? 0;
                return (
                  <TR key={s.id} data-testid={`trial-${s.organization.id}`}>
                    <TD><Link href={`/admin/customers/${s.organization.id}`} className="font-medium text-primary hover:underline">{s.organization.name}</Link></TD>
                    <TD className="text-sm">{locale === "en" ? s.plan.nameEn : s.plan.nameNl}</TD>
                    <TD className="tabular text-xs">{f.date(s.trialStart)}</TD>
                    <TD className="tabular text-xs">{f.date(s.trialEnd)}</TD>
                    <TD className="tabular text-right"><Badge variant={left <= settings.trialReminderDays ? "warning" : "default"}>{left}</Badge></TD>
                    <TD className="text-xs">{s.trialReminderAt ? f.date(s.trialReminderAt) : "—"}</TD>
                    <TD className="min-w-72 space-y-2">
                      <OpForm action={subscriptionAction} title={t("saas.sub.ops.extendTrial")} submit={t("saas.sub.ops.extendTrial")} hidden={{ id: s.id, op: "extendTrial" }}>
                        <OpField label={t("saas.sub.days")} wide><Input name="days" type="number" min={1} max={365} defaultValue={14} /></OpField>
                      </OpForm>
                      <OpForm action={subscriptionAction} title={t("saas.sub.ops.convertTrial")} submit={t("saas.sub.ops.convertTrial")} hidden={{ id: s.id, op: "convertTrial" }} variant="default">
                        <OpField label={t("saas.sub.cycle")} wide><Select name="cycle" defaultValue={s.billingCycle}><option value="MONTHLY">{t("saas.cycle.MONTHLY")}</option><option value="YEARLY">{t("saas.cycle.YEARLY")}</option></Select></OpField>
                      </OpForm>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
      <Card>
        <Table>
          <THead><TR><TH>{t("saas.trials.ended")}</TH><TH>{t("saas.customers.cols.plan")}</TH><TH>{t("saas.sub.trialEnd")}</TH><TH>{t("saas.trials.conversion")}</TH></TR></THead>
          <TBody>
            {ended.length === 0 && <TR><TD colSpan={4} className="text-sm text-muted-foreground">{t("saas.none")}</TD></TR>}
            {ended.map((s) => {
              const c = conversion(s);
              return (
                <TR key={s.id}>
                  <TD><Link href={`/admin/customers/${s.organization.id}`} className="hover:underline">{s.organization.name}</Link></TD>
                  <TD className="text-sm">{locale === "en" ? s.plan.nameEn : s.plan.nameNl}</TD>
                  <TD className="tabular text-xs">{f.date(s.trialEnd)}</TD>
                  <TD><Badge variant={variant[c]}>{t(`saas.trials.status.${c}`)}</Badge></TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
