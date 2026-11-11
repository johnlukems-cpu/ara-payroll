-- ARA Payroll standard health insurance setting (decision of ARA Intelligent Solutions, 11 November 2026):
-- 4% of the base salary, 2% employee and 2% employer (50/50 per S.B. 2014 no. 114 art. 7 lid 6).
-- This is a policy premium, not a statutory rate; the contributions page asks each company to check it.
-- Applied only to UNTOUCHED health schemes (not approved, no rates or amounts, not marked not applicable) of
-- companies without an approved health scheme. Finalised payslips are never recalculated.
UPDATE "ContributionScheme" s SET
  "method" = 'PERCENTAGE', "base" = 'BASE_SALARY', "employeeRateBp" = 200, "employerRateBp" = 200,
  "isActive" = true, "approvedAt" = NOW(), "legalStatus" = 'VERIFIED',
  "notes" = 'Standaardinstelling van ARA Payroll: 4% van het basissalaris (2% werknemer, 2% werkgever). Dit is geen wettelijk tarief: controleer het percentage met de polis van uw zorgverzekeraar en pas het zo nodig aan.',
  "updatedAt" = NOW()
WHERE s."type" = 'HEALTH' AND s."approvedAt" IS NULL AND s."notApplicable" = false
  AND s."employeeRateBp" = 0 AND s."employerRateBp" = 0 AND s."employeeAmount" = 0 AND s."employerAmount" = 0
  AND NOT EXISTS (SELECT 1 FROM "ContributionScheme" o WHERE o."companyId" = s."companyId" AND o."type" = 'HEALTH' AND o."approvedAt" IS NOT NULL);
