import { getI18n } from "@/lib/server/i18n";
import { toDateInput } from "@/lib/format";
import type { ActionState } from "@/lib/server/action";
import { ActionForm, FieldError } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Field, Input } from "@/components/ui/form";
import { CurrencySelect, type CurrencyOption } from "@/components/currency-select";

export async function RateForm({ action, currencies, defaultBase, defaultQuote }: { action: (s: ActionState, fd: FormData) => Promise<ActionState>; currencies: CurrencyOption[]; defaultBase: string; defaultQuote: string }) {
  const { t } = await getI18n();
  return (
    <ActionForm action={action} className="grid gap-3 sm:grid-cols-2" resetOnSuccess>
      <Field label={t("rates.base")} htmlFor="baseCurrency"><CurrencySelect id="baseCurrency" name="baseCurrency" currencies={currencies} defaultValue={defaultBase} /><FieldError name="baseCurrency" /></Field>
      <Field label={t("rates.quote")} htmlFor="quoteCurrency"><CurrencySelect id="quoteCurrency" name="quoteCurrency" currencies={currencies} defaultValue={defaultQuote} /><FieldError name="quoteCurrency" /></Field>
      <Field label={t("rates.rate")} htmlFor="rate"><Input id="rate" name="rate" inputMode="decimal" placeholder="36,50" /><FieldError name="rate" /></Field>
      <Field label={t("rates.effectiveDate")} htmlFor="effectiveDate"><Input id="effectiveDate" name="effectiveDate" type="date" defaultValue={toDateInput(new Date())} /><FieldError name="effectiveDate" /></Field>
      <Field label={t("rates.notes")} htmlFor="notes" className="sm:col-span-2"><Input id="notes" name="notes" placeholder={t("rates.notesPlaceholder")} /></Field>
      <div className="sm:col-span-2"><SubmitButton>{t("rates.add")}</SubmitButton></div>
    </ActionForm>
  );
}
