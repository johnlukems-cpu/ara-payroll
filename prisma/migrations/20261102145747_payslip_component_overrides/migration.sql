-- AlterTable
ALTER TABLE "PayrollAdjustment" ADD COLUMN     "assignmentId" TEXT;

-- CreateIndex
CREATE INDEX "PayrollAdjustment_runId_employeeId_idx" ON "PayrollAdjustment"("runId", "employeeId");

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "EmployeePayComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
INSERT INTO "ComponentLibrary" ("code","category","kind","nameNl","nameEn","calcType","taxTreatment","multiplierBp","aovIncluded","pensionIncluded","netEffect","employerCost","preTax","frequency","isSystem","systemCode","legalStatus","legalReference","sortOrder") VALUES ('DED013','DEDUCTION','DEDUCTION','Pensioenbijdrage (vast bedrag)','Pension contribution (fixed amount)','FIXED','TAXABLE',10000,false,false,'DEDUCT',false,true,'RECURRING',false,NULL,'COMPANY_POLICY','Alleen gebruiken als er geen pensioenpercentage in de arbeidsovereenkomst staat',51) ON CONFLICT ("code") DO NOTHING;
