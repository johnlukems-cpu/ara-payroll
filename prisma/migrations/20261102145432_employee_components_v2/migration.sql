-- CreateEnum
CREATE TYPE "AssignmentFrequency" AS ENUM ('MONTHLY', 'PER_PERIOD', 'ONE_OFF', 'ANNUAL', 'ACCRUAL');

-- CreateEnum
CREATE TYPE "LineSource" AS ENUM ('BASE', 'FIXED', 'INCIDENTAL', 'STATUTORY', 'LEAVE');

-- AlterTable
ALTER TABLE "EmployeePayComponent" ADD COLUMN     "aovIncluded" BOOLEAN,
ADD COLUMN     "baseComponentCode" TEXT,
ADD COLUMN     "calcType" "CalcType",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "frequency" "AssignmentFrequency" NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "label" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "payMonth" INTEGER,
ADD COLUMN     "pensionIncluded" BOOLEAN,
ADD COLUMN     "taxOverride" "TaxTreatment",
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "PayComponent" ADD COLUMN     "availableToAll" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "PayrollAdjustment" ADD COLUMN     "allowDuplicate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aovIncluded" BOOLEAN,
ADD COLUMN     "baseComponentCode" TEXT,
ADD COLUMN     "calcType" "CalcType",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "pensionIncluded" BOOLEAN,
ADD COLUMN     "rateBp" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "taxOverride" "TaxTreatment";

-- AlterTable
ALTER TABLE "PayslipLine" ADD COLUMN     "source" "LineSource";

-- CreateIndex
CREATE INDEX "EmployeePayComponent_employeeId_idx" ON "EmployeePayComponent"("employeeId");
