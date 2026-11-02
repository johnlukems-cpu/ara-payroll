import type { Fmt } from "@/lib/format";
import type { Conversion } from "@/lib/currency";

type T = (key: string, values?: Record<string, string | number>) => string;
type Line = { code: string; description: string; quantity: number | null; rate: number | null };

const STATUTORY = new Set(["UNPAID", "BONUS", "LB", "LB-BB", "LB-OT", "AOV", "PENS", "PENS-ER"]);

/**
 * Display label for a payslip line in the reader's language. Statutory lines are translated by code;
 * allowance/deduction lines carry the company-defined component name.
 */
export function lineLabel(line: Line, t: T, f: Fmt, overtimeRates: { ot1: number; ot2: number }) {
  if (line.code === "BASE") {
    if (line.rate != null) return t("payslip.lines.HOURLY");
    return line.quantity != null ? t("payslip.lines.BASE_PRORATED") : t("payslip.lines.BASE");
  }
  if (line.code === "OT1") return t("payslip.lines.OT", { pct: f.pct(overtimeRates.ot1) });
  if (line.code === "OT2") return t("payslip.lines.OT", { pct: f.pct(overtimeRates.ot2) });
  if (STATUTORY.has(line.code)) return t(`payslip.lines.${line.code}`);
  return line.description;
}

const PURPOSES = new Set(["BASE", "HOURLY_RATE", "BONUS", "NET_PAY", "REPORTING"]);

export function conversionLabel(c: Conversion, t: T) {
  return PURPOSES.has(c.purpose) ? t(`payslip.convPurpose.${c.purpose}`) : c.purpose;
}
