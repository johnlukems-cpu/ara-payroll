/**
 * Statutory contribution parameters verified against the primary texts (checked 11 November 2026).
 * Used to pre-configure (and approve) the statutory schemes; companies can still change or replace them.
 *
 * - FVO: S.B. 2019 no. 64 art. 12 lid 4 — 1.0% of gross wage, employee max. 50%, employer min. 50%;
 *   basis per the Fund: base wage without allowances and emoluments; premium in force from 1 April 2023.
 * - Pension: Wet Algemeen Pensioen 2014 (S.B. 2014 no. 113) art. 8 — 3% at entry into force, +0.5% every
 *   1 January from 2016 up to 28%; 50/50 split; contribution base min. SRD 2,250 / max. SRD 22,500 per month
 *   (art. 8 lid 3 as amended by S.B. 2023 no. 118, from 1 January 2023); "loon" per art. 6 excludes overtime,
 *   holiday and year-end payments etc. (closest base in ARA Payroll: regular wage).
 * - Health: Wet Nationale Basiszorgverzekering (S.B. 2014 no. 114) art. 7 lid 6–7 — 50/50 split; the premium
 *   itself follows from the insurer's policy, so no amount is pre-filled.
 */
export const VERIFIED_AT = "2026-11-11";

export const FVO_RULE = {
  employeeRateBp: 50, employerRateBp: 50, base: "BASE_SALARY" as const, effectiveFrom: "2023-04-01",
  legalReference: "Wet Arbeidsbescherming Gezin, S.B. 2019 no. 64, art. 12 lid 4: 1,0% van het brutoloon (basisloon zonder toelagen en emolumenten, FVO), werknemer max. 50%, werkgever min. 50% — geverifieerd 11-11-2026",
};

/** Statutory total pension premium (basis points) for a calendar year, per WAP 2014 art. 8 lid 1–2. */
export function pensionRateBp(year: number): number {
  if (year < 2016) return 300;
  return Math.min(2800, 300 + 50 * (year - 2015));
}

export const PENSION_RULE = {
  base: "REGULAR_WAGE" as const, currency: "SRD", minBaseMonthly: 225_000, maxBaseMonthly: 2_250_000, // minor units (SRD 2,250 / 22,500)
  legalReference: (year: number) => `Wet Algemeen Pensioen 2014, S.B. 2014 no. 113, art. 8 lid 2: premie ${(pensionRateBp(year) / 100).toLocaleString("nl-NL")}% in ${year} (50% werknemer / 50% werkgever, art. 8 lid 7); grondslag min. SRD 2.250 / max. SRD 22.500 per maand (art. 8 lid 3, S.B. 2023 no. 118); loon zonder overwerk, vakantie- en eindejaarsuitkeringen (art. 6) — geverifieerd 11-11-2026`,
};

export const HEALTH_RULE = {
  legalReference: "Wet Nationale Basiszorgverzekering, S.B. 2014 no. 114, art. 7 lid 6–7 en art. 8: premie conform de polis van de zorgverzekeraar, 50% werknemer / 50% werkgever (werknemersdeel nooit hoger) — geverifieerd 11-11-2026; vul het maandbedrag uit uw polis in",
};

/**
 * ARA Payroll's standard health insurance setting (NOT a statutory rate): 4% of the base salary, split 50/50 as
 * required by S.B. 2014 no. 114 art. 7 lid 6. The actual premium follows each company's insurance policy, so the
 * contributions page asks companies to check it. Recognised by its note text.
 */
export const HEALTH_DEFAULT = { method: "PERCENTAGE" as const, base: "BASE_SALARY" as const, employeeRateBp: 200, employerRateBp: 200 };
export const HEALTH_DEFAULT_NOTE_NL = "Standaardinstelling van ARA Payroll: 4% van het basissalaris (2% werknemer, 2% werkgever). Dit is geen wettelijk tarief: controleer het percentage met de polis van uw zorgverzekeraar en pas het zo nodig aan.";
export const HEALTH_DEFAULT_NOTE_EN = "ARA Payroll standard setting: 4% of the base salary (2% employee, 2% employer). This is not a statutory rate: check the percentage against your insurer's policy and adjust it if needed.";

/** Pension scheme versions for a year and the next one (rates rise every 1 January). */
export function pensionVersions(year: number) {
  return [year, year + 1].map((y) => ({
    year: y, employeeRateBp: pensionRateBp(y) / 2, employerRateBp: pensionRateBp(y) / 2,
    effectiveFrom: new Date(Date.UTC(y, 0, 1)), effectiveTo: new Date(Date.UTC(y, 11, 31)),
  }));
}
