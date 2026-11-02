/**
 * Currency primitives. Amounts are integers in the currency's minor unit
 * (e.g. cents for 2-decimal currencies). Currencies are identified by ISO 4217 code only.
 */

export const DEFAULT_DECIMALS = 2;

export interface CurrencyInfo {
  code: string;
  decimals: number;
}

export interface Conversion {
  purpose: string;
  from: string;
  to: string;
  originalAmount: number;
  convertedAmount: number;
  /** 1 unit of `from` = rate units of `to`. */
  rate: string;
  rateDate: string | null;
  rateId: string | null;
  source: "IDENTITY" | "MANUAL" | "API" | "INVERSE";
}

export class MissingRateError extends Error {
  constructor(public from: string, public to: string, public onDate: Date) {
    super(`No approved exchange rate ${from}→${to} effective on ${onDate.toISOString().slice(0, 10)}`);
  }
}

/**
 * Converts a minor-unit amount using a decimal rate string, rounding half away from zero.
 * Uses scaled BigInt arithmetic so no precision is lost on large salaries.
 */
export function convertMinor(amount: number, rate: string, fromDecimals = DEFAULT_DECIMALS, toDecimals = DEFAULT_DECIMALS): number {
  if (amount === 0) return 0;
  const [intPart, fracPart = ""] = rate.trim().split(".");
  if (!/^\d+$/.test(intPart) || !/^\d*$/.test(fracPart)) throw new Error(`Invalid rate: ${rate}`);
  const rateScale = BigInt(10) ** BigInt(fracPart.length);
  const rateInt = BigInt(intPart + fracPart);
  const sign = amount < 0 ? -BigInt(1) : BigInt(1);
  let num = BigInt(Math.abs(amount)) * rateInt * BigInt(10) ** BigInt(toDecimals);
  let den = rateScale * BigInt(10) ** BigInt(fromDecimals);
  // round half up on the absolute value
  const q = num / den;
  const r = num % den;
  const rounded = r * BigInt(2) >= den ? q + BigInt(1) : q;
  num = rounded * sign;
  den = BigInt(1);
  return Number(num / den);
}

/** Inverts a rate string with fixed precision (10 decimals). */
export function invertRate(rate: string): string {
  const v = Number(rate);
  if (!(v > 0)) throw new Error(`Invalid rate: ${rate}`);
  return (1 / v).toFixed(10);
}

/** Parses a user-entered rate ("36,25" or "36.25"). Returns a normalised decimal string or null. */
export function parseRate(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,10})?$/.test(s)) return null;
  if (Number(s) <= 0) return null;
  return s;
}
