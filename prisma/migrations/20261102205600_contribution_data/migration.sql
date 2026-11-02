-- Library: employee/employer contribution names, FVO employer share and tax-free reimbursements.
INSERT INTO "ComponentLibrary" ("code","category","kind","nameNl","nameEn","calcType","taxTreatment","multiplierBp","aovIncluded","pensionIncluded","netEffect","employerCost","preTax","frequency","isSystem","systemCode","legalStatus","legalReference","sortOrder") VALUES ('ALW015','ALLOWANCE','ALLOWANCE','Overige onbelaste kostenvergoedingen','Other tax-free reimbursements','FIXED','EXEMPT',10000,false,false,'ADD',true,false,'RECURRING',false,NULL,'PENDING_VERIFICATION','Alleen voor werkelijk gemaakte, aantoonbare kosten; fiscale vrijstelling niet geverifieerd',22) ON CONFLICT ("code") DO NOTHING;
INSERT INTO "ComponentLibrary" ("code","category","kind","nameNl","nameEn","calcType","taxTreatment","multiplierBp","aovIncluded","pensionIncluded","netEffect","employerCost","preTax","frequency","isSystem","systemCode","legalStatus","legalReference","sortOrder") VALUES ('ER007','EMPLOYER','EMPLOYER','FVO – werkgeversaandeel','FVO – Employer Contribution','FIXED','TAXABLE',10000,false,false,'NONE',true,false,'RECURRING',false,NULL,'PENDING_VERIFICATION','Fonds ouderschapsverlof (Wet Arbeidsbescherming Gezin) — percentage en verdeling werkgever/werknemer niet geverifieerd',59) ON CONFLICT ("code") DO NOTHING;
UPDATE "ComponentLibrary" SET "nameNl" = 'Pensioen – werknemersaandeel', "nameEn" = 'Pension – Employee Contribution' WHERE "code" = 'DED002';
UPDATE "ComponentLibrary" SET "nameNl" = 'Ziektekostenverzekering – werknemersaandeel', "nameEn" = 'Health Insurance – Employee Contribution' WHERE "code" = 'DED004';
UPDATE "ComponentLibrary" SET "nameNl" = 'FVO – werknemersaandeel', "nameEn" = 'FVO – Employee Contribution' WHERE "code" = 'DED012';
UPDATE "ComponentLibrary" SET "nameNl" = 'Pensioen – werkgeversaandeel', "nameEn" = 'Pension – Employer Contribution' WHERE "code" = 'ER001';
UPDATE "ComponentLibrary" SET "nameNl" = 'Ziektekostenverzekering – werkgeversaandeel', "nameEn" = 'Health Insurance – Employer Contribution' WHERE "code" = 'ER002';
-- Adopted company components: only names that were never changed by the company are updated.
UPDATE "PayComponent" SET "nameNl" = 'Ziektekostenverzekering – werknemersaandeel', "nameEn" = 'Health Insurance – Employee Contribution' WHERE "libraryCode" = 'DED004' AND "nameNl" = 'Ziektekostenverzekering' AND "nameEn" = 'Health insurance';
UPDATE "PayComponent" SET "name" = 'Ziektekostenverzekering – werknemersaandeel' WHERE "libraryCode" = 'DED004' AND "name" = 'Ziektekostenverzekering';
UPDATE "PayComponent" SET "nameNl" = 'FVO – werknemersaandeel', "nameEn" = 'FVO – Employee Contribution' WHERE "libraryCode" = 'DED012' AND "nameNl" = 'FVO-bijdrage' AND "nameEn" = 'FVO contribution';
UPDATE "PayComponent" SET "name" = 'FVO – werknemersaandeel' WHERE "libraryCode" = 'DED012' AND "name" = 'FVO-bijdrage';
UPDATE "PayComponent" SET "nameNl" = 'Ziektekostenverzekering – werkgeversaandeel', "nameEn" = 'Health Insurance – Employer Contribution' WHERE "libraryCode" = 'ER002' AND "nameNl" = 'Werkgeversbijdrage ziektekosten' AND "nameEn" = 'Employer health contribution';
UPDATE "PayComponent" SET "name" = 'Ziektekostenverzekering – werkgeversaandeel' WHERE "libraryCode" = 'ER002' AND "name" = 'Werkgeversbijdrage ziektekosten';

-- One inactive scheme per type for every existing company. Rates are deliberately 0: they must be
-- configured (and statutory schemes verified) before the scheme can be activated.
INSERT INTO "ContributionScheme" ("id", "companyId", "type", "name", "basis", "method", "base", "currency", "effectiveFrom", "isActive", "appliesToAll", "employeeTax", "legalStatus", "legalReference", "updatedAt")
SELECT 'cs_' || md5(c."id" || t."type"), c."id", t."type"::"ContributionType", t."name", t."basis"::"ContributionBasis", 'PERCENTAGE', t."base"::"ContributionBase", c."currency", date_trunc('year', now()), false, true, t."tax"::"ContributionTax", t."legal"::"LegalStatus", t."ref", now()
FROM "Company" c
CROSS JOIN (VALUES
  ('HEALTH', 'Ziektekostenverzekering', 'STATUTORY', 'BASE_SALARY', 'AFTER_TAX', 'PENDING_VERIFICATION', 'Basiszorgverzekering — premie, grondslag en verdeling werkgever/werknemer niet geverifieerd'),
  ('PENSION', 'Pensioenregeling', 'VOLUNTARY', 'PENSION_BASE', 'PRE_TAX', 'COMPANY_POLICY', 'Pensioenreglement van de werkgever / het pensioenfonds'),
  ('FVO', 'FVO-bijdrage', 'STATUTORY', 'BASE_SALARY', 'AFTER_TAX', 'PENDING_VERIFICATION', 'Fonds ouderschapsverlof (Wet Arbeidsbescherming Gezin) — percentage en verdeling werkgever/werknemer niet geverifieerd')
) AS t("type", "name", "basis", "base", "tax", "legal", "ref")
WHERE NOT EXISTS (SELECT 1 FROM "ContributionScheme" s WHERE s."companyId" = c."id" AND s."type" = t."type"::"ContributionType");
