-- Pin the currency of existing fixed allowances/deductions and one-off adjustments.
-- Before multicurrency, all amounts were in the company currency. Leaving them NULL ("salary currency")
-- would silently reinterpret e.g. SRD 600 as USD 600 when an employee moves to a foreign-currency contract.
UPDATE "EmployeePayComponent" a
SET "currency" = c."currency"
FROM "Employee" e JOIN "Company" c ON c."id" = e."companyId"
WHERE e."id" = a."employeeId" AND a."currency" IS NULL;

UPDATE "PayrollAdjustment" a
SET "currency" = c."currency"
FROM "PayrollRun" r JOIN "Company" c ON c."id" = r."companyId"
WHERE r."id" = a."runId" AND a."currency" IS NULL;
