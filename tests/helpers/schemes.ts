import type { PrismaClient } from "@prisma/client";

/**
 * Puts the default contribution schemes of a test company back to the untouched state (inactive, no rates,
 * one version per type), so scenario tests can configure the schemes themselves. New companies otherwise get
 * FVO and pension pre-configured from the verified statutory rules (see tests/integration/statutory-defaults).
 */
export async function resetDefaultSchemes(db: PrismaClient, companyId: string) {
  const schemes = await db.contributionScheme.findMany({ where: { companyId }, orderBy: { effectiveFrom: "asc" } });
  const keep = new Set<string>();
  for (const s of schemes) if (![...keep].some((id) => schemes.find((x) => x.id === id)!.type === s.type)) keep.add(s.id);
  await db.contributionScheme.deleteMany({ where: { companyId, id: { notIn: [...keep] } } });
  await db.contributionScheme.updateMany({
    where: { companyId },
    data: { isActive: false, approvedAt: null, employeeRateBp: 0, employerRateBp: 0, employeeAmount: 0, employerAmount: 0, minBaseMonthly: null, maxBaseMonthly: null, effectiveTo: null, effectiveFrom: new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)), legalStatus: "PARTIALLY_VERIFIED" },
  });
}
