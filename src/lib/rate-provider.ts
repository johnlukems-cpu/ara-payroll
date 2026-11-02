/**
 * External exchange-rate provider integration. Configured by the platform administrator.
 * Fetched rates are informational market rates: they are stored as records and, depending on
 * company policy, must be approved before payroll may use them. ARA Payroll never assumes that an
 * API rate is a legally valid payroll rate.
 */

export interface ProviderConfig {
  enabled: boolean;
  name: string;
  /** URL template; `{base}` is replaced with the base currency code. */
  url: string;
  /** Optional API key, sent as `Authorization: Bearer <key>` and substituted for `{apiKey}` in the URL. */
  apiKey?: string;
}

export const DEFAULT_PROVIDER: ProviderConfig = {
  enabled: false,
  name: "ExchangeRate-API (open access)",
  url: "https://open.er-api.com/v6/latest/{base}",
};

/** Extracts `{ CODE: rate }` from common provider response shapes. */
export function parseProviderResponse(json: unknown): Record<string, number> {
  if (!json || typeof json !== "object") throw new Error("Invalid provider response");
  const o = json as Record<string, unknown>;
  const rates = (o.rates ?? o.conversion_rates ?? o.data) as Record<string, unknown> | undefined;
  if (!rates || typeof rates !== "object") throw new Error("Provider response contains no rates");
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(rates)) {
    const n = typeof v === "number" ? v : typeof v === "object" && v && "value" in v ? Number((v as { value: unknown }).value) : NaN;
    if (/^[A-Z]{3}$/.test(k) && Number.isFinite(n) && n > 0) out[k] = n;
  }
  return out;
}

export async function fetchProviderRates(cfg: ProviderConfig, base: string, quotes: string[]) {
  const url = cfg.url.replace("{base}", encodeURIComponent(base)).replace("{apiKey}", encodeURIComponent(cfg.apiKey ?? ""));
  if (!/^https:\/\//.test(url)) throw new Error("Provider URL must use HTTPS");
  const res = await fetch(url, {
    headers: cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : undefined,
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Provider returned HTTP ${res.status}`);
  const all = parseProviderResponse(await res.json());
  return quotes.filter((q) => q !== base && all[q]).map((q) => ({ quote: q, rate: all[q] }));
}
