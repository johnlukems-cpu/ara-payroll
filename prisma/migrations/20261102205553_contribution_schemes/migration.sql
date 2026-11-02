-- CreateEnum
CREATE TYPE "ContributionType" AS ENUM ('HEALTH', 'PENSION', 'FVO');

-- CreateEnum
CREATE TYPE "ContributionMethod" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "ContributionBase" AS ENUM ('BASE_SALARY', 'PENSION_BASE', 'REGULAR_WAGE', 'GROSS_WAGE');

-- CreateEnum
CREATE TYPE "ContributionBasis" AS ENUM ('STATUTORY', 'VOLUNTARY');

-- CreateEnum
CREATE TYPE "ContributionTax" AS ENUM ('PRE_TAX', 'AFTER_TAX');

-- AlterEnum
ALTER TYPE "LineSource" ADD VALUE 'CONTRIBUTION';

-- AlterTable
ALTER TABLE "PayslipLine" ADD COLUMN     "group" TEXT,
ADD COLUMN     "showOnPayslip" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ContributionScheme" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "ContributionType" NOT NULL,
    "name" TEXT NOT NULL,
    "basis" "ContributionBasis" NOT NULL,
    "method" "ContributionMethod" NOT NULL DEFAULT 'PERCENTAGE',
    "base" "ContributionBase" NOT NULL DEFAULT 'BASE_SALARY',
    "employeeRateBp" INTEGER NOT NULL DEFAULT 0,
    "employerRateBp" INTEGER NOT NULL DEFAULT 0,
    "employeeAmount" INTEGER NOT NULL DEFAULT 0,
    "employerAmount" INTEGER NOT NULL DEFAULT 0,
    "maxBaseMonthly" INTEGER,
    "currency" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "appliesToAll" BOOLEAN NOT NULL DEFAULT true,
    "employeeTax" "ContributionTax" NOT NULL DEFAULT 'AFTER_TAX',
    "showOnPayslip" BOOLEAN NOT NULL DEFAULT true,
    "legalStatus" "LegalStatus" NOT NULL DEFAULT 'COMPANY_POLICY',
    "legalReference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContributionScheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeContribution" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "schemeId" TEXT NOT NULL,
    "participates" BOOLEAN NOT NULL DEFAULT true,
    "employeeRateBp" INTEGER,
    "employerRateBp" INTEGER,
    "employeeAmount" INTEGER,
    "employerAmount" INTEGER,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeContribution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContributionScheme_companyId_type_idx" ON "ContributionScheme"("companyId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeContribution_employeeId_schemeId_key" ON "EmployeeContribution"("employeeId", "schemeId");

-- AddForeignKey
ALTER TABLE "ContributionScheme" ADD CONSTRAINT "ContributionScheme_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeContribution" ADD CONSTRAINT "EmployeeContribution_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeContribution" ADD CONSTRAINT "EmployeeContribution_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "ContributionScheme"("id") ON DELETE CASCADE ON UPDATE CASCADE;
