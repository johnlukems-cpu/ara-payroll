/**
 * Contribution schemes (health insurance, pension, FVO): pure helpers shared by the engine, service and UI.
 * Every scheme has an employee share (a deduction) and an employer share (an employer cost that never
 * reduces net pay). Only rates verified against the primary legal texts (statutory.ts) are pre-filled.
 */
import { FVO_RULE, HEALTH_RULE, PENSION_RULE, pensionRateBp } from "./statutory";

export type ContributionType = "HEALTH" | "PENSION" | "FVO";
export const CONTRIBUTION_TYPES: ContributionType[] = ["HEALTH", "PENSION", "FVO"];

/** Default schemes created for every company. FVO and pension are pre-configured from verified law (statutory.ts). */
export const DEFAULT_SCHEMES: {
  type: ContributionType; nameNl: string; nameEn: string; basis: "STATUTORY" | "VOLUNTARY"; method: "PERCENTAGE" | "FIXED";
  base: "BASE_SALARY" | "PENSION_BASE" | "REGULAR_WAGE" | "GROSS_WAGE"; employeeTax: "PRE_TAX" | "AFTER_TAX";
  legalStatus: "VERIFIED" | "PARTIALLY_VERIFIED" | "PENDING_VERIFICATION" | "COMPANY_POLICY"; legalReference: string;
}[] = [
  {
    type: "HEALTH", nameNl: "Ziektekostenverzekering", nameEn: "Health insurance", basis: "STATUTORY", method: "FIXED", base: "BASE_SALARY", employeeTax: "AFTER_TAX", legalStatus: "VERIFIED",
    legalReference: HEALTH_RULE.legalReference,
  },
  {
    type: "PENSION", nameNl: "Pensioenregeling", nameEn: "Pension scheme", basis: "STATUTORY", method: "PERCENTAGE", base: "REGULAR_WAGE", employeeTax: "PRE_TAX", legalStatus: "VERIFIED",
    legalReference: PENSION_RULE.legalReference(new Date().getUTCFullYear()),
  },
  {
    type: "FVO", nameNl: "FVO-bijdrage", nameEn: "FVO contribution", basis: "STATUTORY", method: "PERCENTAGE", base: "BASE_SALARY", employeeTax: "AFTER_TAX", legalStatus: "VERIFIED",
    legalReference: FVO_RULE.legalReference,
  },
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

/** Fields of a scheme needed for validation. */
export type SchemeLike = {
  type: ContributionType; basis: "STATUTORY" | "VOLUNTARY"; method: "PERCENTAGE" | "FIXED";
  employeeRateBp: number; employerRateBp: number; employeeAmount: number; employerAmount: number;
  isActive: boolean; approvedAt: Date | null; notApplicable: boolean;
  effectiveFrom: Date; effectiveTo: Date | null; legalStatus: string; legalReference: string | null;
};

/** A scheme is configured when at least one share has a rate (percentage) or an amount (fixed). */
export const isConfigured = (s: Pick<SchemeLike, "method" | "employeeRateBp" | "employerRateBp" | "employeeAmount" | "employerAmount">) =>
  s.method === "FIXED" ? s.employeeAmount > 0 || s.employerAmount > 0 : s.employeeRateBp > 0 || s.employerRateBp > 0;

/** Only active, approved and configured schemes are used in payroll. */
export const isEffective = (s: SchemeLike) => s.isActive && !!s.approvedAt && !s.notApplicable && isConfigured(s);

export type SchemeState = "NOT_APPLICABLE" | "NOT_CONFIGURED" | "AWAITING_APPROVAL" | "INACTIVE" | "FUTURE" | "ENDED" | "ACTIVE";

/** Lifecycle state shown in the validation overview. */
export function schemeState(s: SchemeLike, now: Date): SchemeState {
  if (s.notApplicable) return "NOT_APPLICABLE";
  if (!isConfigured(s)) return "NOT_CONFIGURED";
  if (!s.approvedAt) return "AWAITING_APPROVAL";
  if (!s.isActive) return "INACTIVE";
  if (s.effectiveTo && s.effectiveTo < now) return "ENDED";
  if (s.effectiveFrom > now) return "FUTURE";
  return "ACTIVE";
}

export type SchemeIssue = { code: "NOT_CONFIGURED" | "AWAITING_APPROVAL" | "NOT_ACTIVE" | "LEGAL_UNVERIFIED" | "NO_LEGAL_REFERENCE" | "EMPLOYER_SHARE_BELOW_HALF" | "PENSION_RATE_DIFFERS" | "FVO_RATE_DIFFERS"; blocking: boolean; expected?: string };

/**
 * Validation issues of a scheme. Missing configuration, approval or activation of a statutory scheme blocks
 * finalising payroll (unless the scheme is explicitly marked as not applicable); the rest are warnings.
 */
export function schemeIssues(s: SchemeLike): SchemeIssue[] {
  if (s.notApplicable) return [];
  const statutory = s.basis === "STATUTORY";
  const out: SchemeIssue[] = [];
  if (!isConfigured(s)) out.push({ code: "NOT_CONFIGURED", blocking: statutory });
  else if (!s.approvedAt) out.push({ code: "AWAITING_APPROVAL", blocking: statutory });
  else if (!s.isActive) out.push({ code: "NOT_ACTIVE", blocking: statutory });
  if (statutory && s.legalStatus !== "VERIFIED") out.push({ code: "LEGAL_UNVERIFIED", blocking: false });
  if (statutory && !s.legalReference) out.push({ code: "NO_LEGAL_REFERENCE", blocking: false });
  // Official publications for health insurance, pension (APF) and FVO: the employer pays at least half.
  const employeeHigher = s.method === "FIXED" ? s.employeeAmount > s.employerAmount : s.employeeRateBp > s.employerRateBp;
  if (statutory && isConfigured(s) && employeeHigher) out.push({ code: "EMPLOYER_SHARE_BELOW_HALF", blocking: false });
  // Verified statutory totals (lib/payroll/statutory.ts): warn when a statutory percentage scheme differs.
  if (statutory && isConfigured(s) && s.method === "PERCENTAGE") {
    const total = s.employeeRateBp + s.employerRateBp;
    if (s.type === "PENSION" && total !== pensionRateBp(s.effectiveFrom.getUTCFullYear())) out.push({ code: "PENSION_RATE_DIFFERS", blocking: false, expected: `${pensionRateBp(s.effectiveFrom.getUTCFullYear()) / 100}%` });
    if (s.type === "FVO" && total !== FVO_RULE.employeeRateBp + FVO_RULE.employerRateBp) out.push({ code: "FVO_RATE_DIFFERS", blocking: false, expected: "1%" });
  }
  return out;
}

const overlapsPeriod = (s: Pick<SchemeLike, "effectiveFrom" | "effectiveTo">, start: Date, end: Date) => s.effectiveFrom <= end && (!s.effectiveTo || s.effectiveTo >= start);

/**
 * Statutory contribution types without a usable scheme in the period: a statutory scheme of that type (not marked
 * as not applicable) covers the period, but no scheme of the type is active, approved and configured in it.
 * Payroll for the period cannot be finalised until this is resolved.
 */
export function statutoryGaps(schemes: SchemeLike[], start: Date, end: Date, coveredTypes: ContributionType[] = []): ContributionType[] {
  return CONTRIBUTION_TYPES.filter((type) => {
    if (coveredTypes.includes(type)) return false; // e.g. pension percentages in every employment contract
    const ofType = schemes.filter((s) => s.type === type && overlapsPeriod(s, start, end));
    const required = ofType.some((s) => s.basis === "STATUTORY" && !s.notApplicable);
    return required && !ofType.some((s) => isEffective(s));
  });
}
