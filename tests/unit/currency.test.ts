import { describe, expect, it } from "vitest";
import { convertMinor, invertRate, parseRate } from "@/lib/currency";

describe("convertMinor", () => {
  it("converts with exact decimal arithmetic", () => {
    expect(convertMinor(120000, "36.5")).toBe(4380000); // USD 1,200.00 → SRD 43,800.00
    expect(convertMinor(100, "0.0273972603")).toBe(3); // 1.00 → 0.03 (rounded)
    expect(convertMinor(0, "36.5")).toBe(0);
  });
  it("rounds half away from zero, also for negative amounts", () => {
    expect(convertMinor(1, "0.5")).toBe(1);
    expect(convertMinor(-1, "0.5")).toBe(-1);
    expect(convertMinor(-120000, "36.5")).toBe(-4380000);
  });
  it("handles currencies with different decimal places", () => {
    expect(convertMinor(1000, "150", 2, 0)).toBe(1500); // 10.00 → 1500 (0-decimal currency)
    expect(convertMinor(1500, "0.01", 0, 2)).toBe(1500); // 1500 → 15.00
  });
  it("does not lose precision on large amounts", () => {
    expect(convertMinor(9_000_000_000, "1.0000000001")).toBe(9_000_000_001);
  });
  it("rejects malformed rates", () => {
    expect(() => convertMinor(100, "1e3")).toThrow();
  });
});

describe("rates", () => {
  it("parses localised input", () => {
    expect(parseRate("36,25")).toBe("36.25");
    expect(parseRate(" 1.5 ")).toBe("1.5");
    expect(parseRate("0")).toBeNull();
    expect(parseRate("abc")).toBeNull();
  });
  it("inverts", () => {
    expect(invertRate("4")).toBe("0.2500000000");
  });
});

import { parseProviderResponse } from "@/lib/rate-provider";
describe("parseProviderResponse", () => {
  it("reads open.er-api / exchangerate-api shapes", () => {
    expect(parseProviderResponse({ result: "success", base_code: "USD", rates: { SRD: 36.41, EUR: 0.92, bad: 1, XXX: -1 } })).toEqual({ SRD: 36.41, EUR: 0.92 });
    expect(parseProviderResponse({ conversion_rates: { SRD: 36.4 } })).toEqual({ SRD: 36.4 });
  });
  it("rejects responses without rates", () => {
    expect(() => parseProviderResponse({ error: "x" })).toThrow();
  });
});
