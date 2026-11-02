const nf = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Formats integer cents as SRD. */
export function money(cents: number | null | undefined, currency = "SRD") {
  const v = (cents ?? 0) / 100;
  return `${currency} ${nf.format(v)}`;
}

export function amount(cents: number | null | undefined) {
  return nf.format((cents ?? 0) / 100);
}

export const pct = (bp: number) => `${(bp / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const periodLabel = (year: number, month: number) => `${MONTHS[month - 1]} ${year}`;

export function date(d: Date | string | null | undefined) {
  if (!d) return "—";
  const x = typeof d === "string" ? new Date(d) : d;
  return x.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export const toDateInput = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

/** Parses a user-entered SRD amount ("1,234.56" or "1234,56") to cents. */
export function parseMoney(input: string | null | undefined): number {
  if (!input) return 0;
  let s = String(input).trim().replace(/\s|SRD/gi, "");
  if (/,\d{1,2}$/.test(s) && !/\.\d/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  s = s.replace(/,/g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`Invalid amount: ${input}`);
  return Math.round(n * 100);
}

export const SURINAME_DISTRICTS = ["Paramaribo", "Wanica", "Nickerie", "Coronie", "Saramacca", "Commewijne", "Marowijne", "Para", "Brokopondo", "Sipaliwini"];
export const SURINAME_BANKS = ["De Surinaamsche Bank (DSB)", "Hakrinbank", "Finabank", "Republic Bank Suriname", "Surinaamse Postspaarbank (SPSB)", "Godo", "Cooperatieve Spaar- en Kredietbank (Coop)", "Surichange Bank"];

/** Date `n` days before now (kept outside components so render functions stay pure). */
export const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);
