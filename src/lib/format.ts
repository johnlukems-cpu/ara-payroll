import { INTL_LOCALE, type Locale } from "@/i18n/config";

/**
 * Locale-aware formatting. Language (number/date conventions) is independent from currency:
 * a Dutch-language user can view USD amounts and vice versa. Currencies are always shown by ISO code.
 */
export function createFormat(locale: Locale) {
  const tag = INTL_LOCALE[locale];
  const numCache = new Map<number, Intl.NumberFormat>();
  const num = (decimals: number) => {
    if (!numCache.has(decimals)) numCache.set(decimals, new Intl.NumberFormat(tag, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }));
    return numCache.get(decimals)!;
  };
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const monthFmt = new Intl.DateTimeFormat(tag, { month: "long", timeZone: "UTC" });
  const monthShortFmt = new Intl.DateTimeFormat(tag, { month: "short", timeZone: "UTC" });
  const dateFmt = new Intl.DateTimeFormat(tag, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  const dateTimeFmt = new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "short", timeZone: "America/Paramaribo" });

  return {
    locale,
    tag,
    /** Formats minor units with the currency's ISO code, e.g. "SRD 1.234,56". */
    money: (minor: number | null | undefined, currency: string, decimals = 2) => `${currency} ${num(decimals).format((minor ?? 0) / 10 ** decimals)}`,
    amount: (minor: number | null | undefined, decimals = 2) => num(decimals).format((minor ?? 0) / 10 ** decimals),
    /** Plain value for form inputs (locale decimal separator, no grouping) — accepted by parseMoney. */
    input: (minor: number | null | undefined, decimals = 2) => {
      if (!minor) return "";
      const s = (minor / 10 ** decimals).toFixed(decimals);
      return locale === "nl" ? s.replace(".", ",") : s;
    },
    number: (v: number, maxDecimals = 2) => new Intl.NumberFormat(tag, { maximumFractionDigits: maxDecimals }).format(v),
    rate: (v: string | number) => new Intl.NumberFormat(tag, { maximumFractionDigits: 6 }).format(Number(v)),
    pct: (bp: number) => `${new Intl.NumberFormat(tag, { maximumFractionDigits: 2 }).format(bp / 100)}%`,
    date: (d: Date | string | null | undefined) => (d ? dateFmt.format(typeof d === "string" ? new Date(d) : d) : "—"),
    dateTime: (d: Date) => dateTimeFmt.format(d),
    month: (m: number) => cap(monthFmt.format(new Date(Date.UTC(2000, m - 1, 1)))),
    monthShort: (m: number) => cap(monthShortFmt.format(new Date(Date.UTC(2000, m - 1, 1))).replace(".", "")),
    period: (year: number, month: number) => `${cap(monthFmt.format(new Date(Date.UTC(year, month - 1, 1))))} ${year}`,
  };
}

export type Fmt = ReturnType<typeof createFormat>;

export const toDateInput = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

/** Date `n` days before now (kept outside components so render functions stay pure). */
export const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);

/**
 * Parses a user-entered amount to minor units. Accepts both "1.234,56" (Dutch) and "1,234.56" (English),
 * as well as "1234,56" / "1234.56". When both separators occur, the last one is the decimal separator.
 */
export function parseMoney(input: string | null | undefined, decimals = 2): number {
  if (!input) return 0;
  let s = String(input).trim().replace(/\s/g, "").replace(/^[A-Z]{3}/i, "").replace(/[A-Z]{3}$/i, "");
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? "." : ",";
    const grp = dec === "." ? "," : ".";
    s = s.split(grp).join("").replace(dec, ".");
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const parts = s.split(sep);
    // A single separator followed by 1–2 digits is a decimal separator; otherwise it groups thousands.
    s = parts.length === 2 && parts[1].length > 0 && parts[1].length <= 2 ? `${parts[0]}.${parts[1]}` : parts.join("");
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`Invalid amount: ${input}`);
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`Invalid amount: ${input}`);
  return Math.round(n * 10 ** decimals);
}

export const SURINAME_DISTRICTS = ["Paramaribo", "Wanica", "Nickerie", "Coronie", "Saramacca", "Commewijne", "Marowijne", "Para", "Brokopondo", "Sipaliwini"];
export const SURINAME_BANKS = ["De Surinaamsche Bank (DSB)", "Hakrinbank", "Finabank", "Republic Bank Suriname", "Surinaamse Postspaarbank (SPSB)", "Godo", "Cooperatieve Spaar- en Kredietbank (Coop)", "Surichange Bank"];
