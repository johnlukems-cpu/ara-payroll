import { useLocale } from "next-intl";
import { Select } from "@/components/ui/form";

export type CurrencyOption = { code: string; name: string; nameNl: string };

/** Currency picker. Options are identified by ISO 4217 code; names follow the UI language. */
export function CurrencySelect({ currencies, emptyLabel, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { currencies: CurrencyOption[]; emptyLabel?: string }) {
  const locale = useLocale();
  return (
    <Select {...props}>
      {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
      {currencies.map((c) => (
        <option key={c.code} value={c.code}>{c.code} — {locale === "nl" ? c.nameNl : c.name}</option>
      ))}
    </Select>
  );
}
