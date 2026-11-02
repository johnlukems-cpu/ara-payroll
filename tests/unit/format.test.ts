import { describe, expect, it } from "vitest";
import { createFormat, parseMoney } from "@/lib/format";

describe("parseMoney", () => {
  it("accepts Dutch and English notation", () => {
    expect(parseMoney("1.234,56")).toBe(123456);
    expect(parseMoney("1,234.56")).toBe(123456);
    expect(parseMoney("1234,5")).toBe(123450);
    expect(parseMoney("1234.56")).toBe(123456);
    expect(parseMoney("1.234")).toBe(123400);
    expect(parseMoney("1,234,567")).toBe(123456700);
    expect(parseMoney("SRD 20.000,00")).toBe(2000000);
    expect(parseMoney("")).toBe(0);
  });
  it("rejects garbage", () => {
    expect(() => parseMoney("abc")).toThrow();
  });
});

describe("createFormat", () => {
  it("formats per language, independent from currency", () => {
    expect(createFormat("nl").money(123456, "USD")).toBe("USD 1.234,56");
    expect(createFormat("en").money(123456, "SRD")).toBe("SRD 1,234.56");
    expect(createFormat("nl").period(2026, 3)).toBe("Maart 2026");
    expect(createFormat("en").period(2026, 3)).toBe("March 2026");
    expect(createFormat("nl").pct(1250)).toBe("12,5%");
  });
  it("produces input values that parse back", () => {
    for (const l of ["nl", "en"] as const) expect(parseMoney(createFormat(l).input(2000050))).toBe(2000050);
  });
});
