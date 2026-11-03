import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Snapshot of the statutory rates and parameters used by a payroll run, stored when the run is finalised.
 * Later changes to rule sets, schemes or the legal register never change what was used for an approved run.
 */
export async function buildLegalSnapshot(runId: string) {
  const slips = await db.payslip.findMany({ where: { runId }, select: { taxRuleSetId: true, aovRuleSetId: true, trace: true } });
  const taxIds = [...new Set(slips.map((s) => s.taxRuleSetId).filter((x): x is string => !!x))];
  const aovIds = [...new Set(slips.map((s) => s.aovRuleSetId).filter((x): x is string => !!x))];
  const schemeIds = [...new Set(slips.flatMap((s) => ((s.trace as { contributions?: { id: string }[] } | null)?.contributions ?? []).map((c) => c.id)))];
  const [taxRuleSets, aovRuleSets, schemes, legalSources] = await Promise.all([
    db.taxRuleSet.findMany({ where: { id: { in: taxIds } } }),
    db.aovRuleSet.findMany({ where: { id: { in: aovIds } } }),
    db.contributionScheme.findMany({ where: { id: { in: schemeIds } } }),
    db.legalSource.findMany({ select: { code: true, publication: true, verificationStatus: true, state: true, lastCheckedAt: true } }),
  ]);
  return {
    capturedAt: new Date().toISOString(),
    taxRuleSets: taxRuleSets.map((r) => ({
      id: r.id, name: r.name, regime: r.regime, currency: r.currency, effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo,
      verificationStatus: r.verificationStatus, verifiedUntil: r.verifiedUntil, approvedAt: r.approvedAt, approvedById: r.approvedById,
      taxFreeAnnual: r.taxFreeAnnual, taxFreeMonthly: r.taxFreeMonthly, lumpSumMode: r.lumpSumMode, lumpSumMonthly: r.lumpSumMonthly,
      lumpSumRateBp: r.lumpSumRateBp, lumpSumCapAnnual: r.lumpSumCapAnnual, brackets: r.brackets, overtimeBrackets: r.overtimeBrackets,
      taxCreditMonthly: r.taxCreditMonthly, childAllowanceExempt: r.childAllowanceExempt, childAllowanceMaxChildren: r.childAllowanceMaxChildren,
      bonusExemptAnnual: r.bonusExemptAnnual, calcMethod: r.calcMethod, citations: r.citations,
    })),
    aovRuleSets: aovRuleSets.map((r) => ({
      id: r.id, name: r.name, rateBp: r.rateBp, base: r.base, franchiseMonthly: r.franchiseMonthly, minMonthly: r.minMonthly, maxMonthly: r.maxMonthly,
      employeeShareBp: r.employeeShareBp, exemptFromAge: r.exemptFromAge, effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo,
      verificationStatus: r.verificationStatus, approvedAt: r.approvedAt,
    })),
    contributionSchemes: schemes.map((s) => ({
      id: s.id, type: s.type, name: s.name, basis: s.basis, method: s.method, base: s.base, employeeRateBp: s.employeeRateBp, employerRateBp: s.employerRateBp,
      employeeAmount: s.employeeAmount, employerAmount: s.employerAmount, minBaseMonthly: s.minBaseMonthly, maxBaseMonthly: s.maxBaseMonthly, currency: s.currency,
      effectiveFrom: s.effectiveFrom, effectiveTo: s.effectiveTo, employeeTax: s.employeeTax, legalStatus: s.legalStatus, legalReference: s.legalReference,
      approvedAt: s.approvedAt, approvedById: s.approvedById,
    })),
    legalSources,
  } as unknown as Prisma.InputJsonValue;
}
