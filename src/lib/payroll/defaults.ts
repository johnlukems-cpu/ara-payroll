import type { TaxRules } from "./engine";

const SRD = (v: number) => Math.round(v * 100);

/**
 * Default Surinamese statutory parameters used to seed a new installation.
 *
 * IMPORTANT: These values are a starting point and are stored in the database as an
 * UNVERIFIED rule set. Legislation in Suriname changes regularly (Wet Loonbelasting,
 * AOV-wet). A qualified administrator must verify every value against the current
 * publications of the Belastingdienst Suriname before running production payroll.
 */
export const DEFAULT_SR_RULES: TaxRules = {
  // Annual taxable wage brackets (Loonbelasting)
  brackets: [
    { upTo: SRD(108_000), rateBp: 0 },
    { upTo: SRD(150_000), rateBp: 800 },
    { upTo: SRD(192_000), rateBp: 1800 },
    { upTo: SRD(234_000), rateBp: 2800 },
    { upTo: null, rateBp: 3800 },
  ],
  taxCreditMonthly: SRD(750), // heffingskorting
  lumpSumRateBp: 400, // forfaitaire aftrek 4%
  lumpSumCapAnnual: SRD(4_800),
  aovRateBp: 400, // AOV premium 4%
  aovFranchiseMonthly: SRD(400),
  // Special overtime rates per month of overtime pay
  overtimeBrackets: [
    { upTo: SRD(2_500), rateBp: 500 },
    { upTo: SRD(7_500), rateBp: 1500 },
    { upTo: null, rateBp: 2500 },
  ],
  childAllowanceExempt: SRD(125), // tax-free kinderbijslag per child per month
  childAllowanceMaxChildren: 4,
  bonusExemptAnnual: SRD(10_016), // tax-free bijzondere beloning per year
};
