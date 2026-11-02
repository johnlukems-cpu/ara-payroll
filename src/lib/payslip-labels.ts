import type { Fmt } from "@/lib/format";
import type { Conversion } from "@/lib/currency";

type T = (key: string, values?: Record<string, string | number>) => string;
type Line = { code: string; description: string; quantity: number | null; rate: number | null; labels?: unknown };

const STATUTORY = new Set(["UNPAID", "BONUS", "LB", "LB-BB", "LB-OT", "AOV", "AOV-ER", "PENS", "PENS-ER", "SAL001", "SAL002", "SAL003", "SAL004", "SAL008"]);

/**
 * Display label for a payslip line in the reader's language. Statutory and salary lines are translated by
 * code; component and leave lines use the names stored at calculation time ({ nl, en }) or the description.
 */
export function lineLabel(line: Line, t: T, f: Fmt, overtimeRates: { ot1: number; ot2: number }) {
  if (line.code === "BASE") {
    if (line.rate != null) return t("payslip.lines.HOURLY");
    return line.quantity != null ? t("payslip.lines.BASE_PRORATED") : t("payslip.lines.BASE");
  }
  if (line.code === "OT1") return t("payslip.lines.OT", { pct: f.pct(overtimeRates.ot1) });
  if (line.code === "OT2") return t("payslip.lines.OT", { pct: f.pct(overtimeRates.ot2) });
  if (STATUTORY.has(line.code)) return t(`payslip.lines.${line.code}`);
  const labels = line.labels as { nl?: string; en?: string } | null | undefined;
  const label = labels?.[f.locale] ?? line.description;
  if (line.code.startsWith("LEV") && line.rate != null) return `${label} (${t("payslip.paidShare", { pct: f.pct(line.rate) })})`;
  // Contribution schemes: "<scheme> – employee share" / "– employer share".
  const share = /^(HEALTH|PENSION|FVO)-(EE|ER)$/.exec(line.code);
  if (share) return `${label} – ${t(`payslip.share.${share[2]}`)}`;
  return label;
}

const PURPOSES = new Set(["BASE", "HOURLY_RATE", "BONUS", "NET_PAY", "REPORTING"]);

export function conversionLabel(c: Conversion, t: T) {
  return PURPOSES.has(c.purpose) ? t(`payslip.convPurpose.${c.purpose}`) : c.purpose;
}
