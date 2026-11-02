import { getI18n } from "@/lib/server/i18n";
import type { ActionState } from "@/lib/server/action";
import { ActionForm, FieldError } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/form";

/** Professional verification of a statutory rule set: valid-until date, reviewer/source, explicit confirmation. */
export async function VerifyForm({ id, action }: { id: string; action: (s: ActionState, fd: FormData) => Promise<ActionState> }) {
  const { t } = await getI18n();
  return (
    <details className="rounded-lg border bg-muted/30 p-3 text-sm">
      <summary className="cursor-pointer font-medium">{t("settings.tax.markVerified")}</summary>
      <ActionForm action={action} className="mt-3 grid gap-2 sm:grid-cols-3">
        <input type="hidden" name="id" value={id} />
        <label className="space-y-1"><span className="text-xs">{t("rules.verifiedUntil")}</span><Input name="verifiedUntil" type="date" /><FieldError name="verifiedUntil" /></label>
        <label className="space-y-1 sm:col-span-2"><span className="text-xs">{t("rules.reviewer")}</span><Input name="reviewer" placeholder={t("rules.reviewerPlaceholder")} /><FieldError name="reviewer" /></label>
        <label className="flex items-start gap-2 text-xs sm:col-span-3"><input type="checkbox" name="confirm" className="mt-0.5" /> {t("settings.tax.verifyConfirm")}</label>
        <FieldError name="confirm" />
        <div className="sm:col-span-3"><SubmitButton size="sm">{t("settings.tax.markVerified")}</SubmitButton></div>
      </ActionForm>
    </details>
  );
}
