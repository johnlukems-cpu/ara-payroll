import { getI18n } from "@/lib/server/i18n";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";

export async function PeriodPicker({ year, month, years }: { year: number; month: number; years: number[] }) {
  const { t, f } = await getI18n();
  return (
    <form className="flex flex-wrap gap-2">
      <Select name="month" defaultValue={month} className="w-40" aria-label={t("payroll.month")}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{f.month(i + 1)}</option>)}</Select>
      <Select name="year" defaultValue={year} className="w-28" aria-label={t("payroll.year")}>{years.map((y) => <option key={y}>{y}</option>)}</Select>
      <Button variant="secondary" type="submit">{t("common.show")}</Button>
    </form>
  );
}

export function parsePeriod(sp: { year?: string; month?: string }, fallback: { year: number; month: number }) {
  const y = Number(sp.year) || fallback.year;
  const m = Math.min(12, Math.max(1, Number(sp.month) || fallback.month));
  return { year: y, month: m };
}
