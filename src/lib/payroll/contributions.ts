/**
 * Contribution schemes (health insurance, pension, FVO): pure helpers shared by the engine, service and UI.
 * Every scheme has an employee share (a deduction) and an employer share (an employer cost that never
 * reduces net pay). Rates are never prefilled — they must be configured by an authorised administrator.
 */
export type ContributionType = "HEALTH" | "PENSION" | "FVO";
export const CONTRIBUTION_TYPES: ContributionType[] = ["HEALTH", "PENSION", "FVO"];

/** Default schemes created (inactive, rates 0) for every company. Statutory schemes must be verified before use. */
export const DEFAULT_SCHEMES: {
  type: ContributionType; nameNl: string; nameEn: string; basis: "STATUTORY" | "VOLUNTARY";
  base: "BASE_SALARY" | "PENSION_BASE"; employeeTax: "PRE_TAX" | "AFTER_TAX";
  legalStatus: "PENDING_VERIFICATION" | "COMPANY_POLICY"; legalReference: string;
}[] = [
  { type: "HEALTH", nameNl: "Ziektekostenverzekering", nameEn: "Health insurance", basis: "STATUTORY", base: "BASE_SALARY", employeeTax: "AFTER_TAX", legalStatus: "PENDING_VERIFICATION", legalReference: "Basiszorgverzekering — premie, grondslag en verdeling werkgever/werknemer niet geverifieerd" },
  { type: "PENSION", nameNl: "Pensioenregeling", nameEn: "Pension scheme", basis: "VOLUNTARY", base: "PENSION_BASE", employeeTax: "PRE_TAX", legalStatus: "COMPANY_POLICY", legalReference: "Pensioenreglement van de werkgever / het pensioenfonds" },
  { type: "FVO", nameNl: "FVO-bijdrage", nameEn: "FVO contribution", basis: "STATUTORY", base: "BASE_SALARY", employeeTax: "AFTER_TAX", legalStatus: "PENDING_VERIFICATION", legalReference: "Fonds ouderschapsverlof (Wet Arbeidsbescherming Gezin) — percentage en verdeling werkgever/werknemer niet geverifieerd" },
];

/** Payslip line codes of the two shares of a scheme. */
export const employeeCode = (t: ContributionType) => `${t}-EE`;
export const employerCode = (t: ContributionType) => `${t}-ER`;

type Window = { effectiveFrom: Date; effectiveTo: Date | null; isActive: boolean };
type Enrollment = { participates: boolean; startDate: Date | null; endDate: Date | null } | null | undefined;

/** Does a scheme apply to an employee in the period [start, end]? */
export function schemeApplies(s: Window & { appliesToAll: boolean }, enrollment: Enrollment, start: Date, end: Date): boolean {
  if (!s.isActive || s.effectiveFrom > end || (s.effectiveTo && s.effectiveTo < start)) return false;
  const inEnrollment = !!enrollment && (!enrollment.startDate || enrollment.startDate <= end) && (!enrollment.endDate || enrollment.endDate >= start);
  if (s.appliesToAll) return !(inEnrollment && enrollment!.participates === false);
  return inEnrollment && enrollment!.participates;
}

/** Effective shares of a scheme for one employee (individual overrides win over the scheme). */
export function effectiveShares(
  s: { employeeRateBp: number; employerRateBp: number; employeeAmount: number; employerAmount: number },
  e?: { employeeRateBp: number | null; employerRateBp: number | null; employeeAmount: number | null; employerAmount: number | null } | null,
) {
  return {
    employeeRateBp: e?.employeeRateBp ?? s.employeeRateBp,
    employerRateBp: e?.employerRateBp ?? s.employerRateBp,
    employeeAmount: e?.employeeAmount ?? s.employeeAmount,
    employerAmount: e?.employerAmount ?? s.employerAmount,
  };
}
