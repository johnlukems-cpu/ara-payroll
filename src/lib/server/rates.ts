import "server-only";
import { db } from "@/lib/db";
import { convertMinor, invertRate, MissingRateError, type Conversion } from "@/lib/currency";
import { DEFAULT_PROVIDER, type ProviderConfig } from "@/lib/rate-provider";

type Policy = { companyId: string; allowApi: boolean };

export async function getCurrencies(activeOnly = true) {
  return db.currency.findMany({ where: activeOnly ? { isActive: true } : {}, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] });
}

export async function assertActiveCurrency(code: string) {
  const c = await db.currency.findUnique({ where: { code } });
  return !!c?.isActive;
}

export async function getProviderConfig(): Promise<ProviderConfig> {
  const s = await db.platformSetting.findUnique({ where: { key: "exchangeRateProvider" } });
  return { ...DEFAULT_PROVIDER, ...((s?.value as Partial<ProviderConfig>) ?? {}) };
}

/**
 * Finds the approved rate for from→to effective on `onDate`.
 * Preference: company rate (direct, then inverse) before platform rate (direct, then inverse);
 * within each, the most recent effective date. API-sourced rates are only used when the company allows them.
 */
export async function findRate(from: string, to: string, onDate: Date, policy: Policy) {
  const sources = policy.allowApi ? undefined : { source: "MANUAL" as const };
  const candidates = await db.exchangeRate.findMany({
    where: {
      status: "APPROVED",
      effectiveDate: { lte: onDate },
      OR: [{ companyId: policy.companyId }, { companyId: null }],
      AND: [{ OR: [{ baseCurrency: from, quoteCurrency: to }, { baseCurrency: to, quoteCurrency: from }] }],
      ...sources,
    },
    orderBy: { effectiveDate: "desc" },
    take: 20,
  });
  const rank = (r: (typeof candidates)[number]) => (r.companyId ? 0 : 2) + (r.baseCurrency === from ? 0 : 1);
  const best = candidates.sort((a, b) => rank(a) - rank(b) || b.effectiveDate.getTime() - a.effectiveDate.getTime())[0];
  if (!best) return null;
  const direct = best.baseCurrency === from;
  return {
    id: best.id,
    rate: direct ? best.rate.toString() : invertRate(best.rate.toString()),
    date: best.effectiveDate,
    source: (direct ? best.source : "INVERSE") as Conversion["source"],
  };
}

/** Converts amounts during a payroll calculation, caching rates and recording every conversion. */
export class RateBook {
  private cache = new Map<string, Awaited<ReturnType<typeof findRate>>>();
  readonly missing = new Set<string>();

  constructor(private onDate: Date, private policy: Policy, private decimals: Map<string, number>) {}

  async prepare(pairs: [string, string][]) {
    for (const [from, to] of pairs) {
      const key = `${from}>${to}`;
      if (from === to || this.cache.has(key)) continue;
      const r = await findRate(from, to, this.onDate, this.policy);
      this.cache.set(key, r);
      if (!r) this.missing.add(`${from}→${to}`);
    }
  }

  /** Synchronous after prepare(); throws MissingRateError for unknown pairs. Records the conversion into `sink`. */
  convert(amount: number, from: string, to: string, purpose: string, sink?: Conversion[]): number {
    if (from === to) return amount;
    const r = this.cache.get(`${from}>${to}`);
    if (!r) throw new MissingRateError(from, to, this.onDate);
    const converted = convertMinor(amount, r.rate, this.decimals.get(from) ?? 2, this.decimals.get(to) ?? 2);
    if (sink) {
      sink.push({
        purpose, from, to, originalAmount: amount, convertedAmount: converted, rate: r.rate,
        rateDate: r.date.toISOString().slice(0, 10), rateId: r.id, source: r.source,
      });
    }
    return converted;
  }

  rateOf(from: string, to: string) {
    return from === to ? "1" : this.cache.get(`${from}>${to}`)?.rate ?? null;
  }
}
