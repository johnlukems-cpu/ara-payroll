-- CreateEnum
CREATE TYPE "ComponentCategory" AS ENUM ('SALARY', 'ALLOWANCE', 'OVERTIME', 'BONUS', 'DEDUCTION', 'EMPLOYER', 'LEAVE');

-- CreateEnum
CREATE TYPE "ComponentFrequency" AS ENUM ('RECURRING', 'ONE_OFF', 'ANNUAL');

-- CreateEnum
CREATE TYPE "NetEffect" AS ENUM ('ADD', 'DEDUCT', 'NONE');

-- CreateEnum
CREATE TYPE "LegalStatus" AS ENUM ('VERIFIED', 'PENDING_VERIFICATION', 'CONFLICT', 'COMPANY_POLICY');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('DRAFT', 'APPROVED');

-- CreateEnum
CREATE TYPE "TaxRegime" AS ENUM ('STANDARD', 'ART17A');

-- CreateEnum
CREATE TYPE "LumpSumMode" AS ENUM ('PERCENT_CAPPED', 'FIXED');

-- CreateEnum
CREATE TYPE "TaxCalcMethod" AS ENUM ('ANNUALIZED', 'MONTHLY_TABLE');

-- CreateEnum
CREATE TYPE "AovBase" AS ENUM ('TAXABLE_WAGE', 'GROSS_WAGE');

-- CreateEnum
CREATE TYPE "LeaveCategory" AS ENUM ('ANNUAL', 'SICK', 'SPECIAL', 'UNPAID', 'PUBLIC_HOLIDAY', 'PARENTAL', 'MATERNITY', 'PATERNITY', 'ADOPTION', 'UNAUTHORIZED');

-- CreateEnum
CREATE TYPE "LeaveUnit" AS ENUM ('DAYS', 'HOURS');

-- CreateEnum
CREATE TYPE "LeavePaymentStatus" AS ENUM ('NOT_APPLICABLE', 'PENDING', 'PAID_BY_EMPLOYER', 'PARTIALLY_PAID', 'UNPAID', 'PAID_BY_FUND');

-- CreateEnum
CREATE TYPE "DeclarationType" AS ENUM ('LB_AOV_MONTHLY', 'VERZAMELLOONSTAAT');

-- CreateEnum
CREATE TYPE "DeclarationStatus" AS ENUM ('IN_PREPARATION', 'CALCULATED', 'UNDER_REVIEW', 'APPROVED', 'READY_FOR_DOWNLOAD', 'DOWNLOADED', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'PAID');

-- CreateEnum
CREATE TYPE "DeclarationFileKind" AS ENUM ('PAYROLL_TAX', 'AOV', 'EMPLOYEE_SCHEDULE', 'PAYROLL_SUMMARY');

-- CreateEnum
CREATE TYPE "FileFormat" AS ENUM ('PDF', 'XLSX', 'CSV');

-- CreateEnum
CREATE TYPE "RunLegalStatus" AS ENUM ('VALIDATED', 'PENDING_LEGAL_VALIDATION');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CalcType" ADD VALUE 'PERCENT_OF_COMPONENT';
ALTER TYPE "CalcType" ADD VALUE 'HOURS_X_RATE';
ALTER TYPE "CalcType" ADD VALUE 'DAYS_X_RATE';
ALTER TYPE "CalcType" ADD VALUE 'QTY_X_PRICE';
ALTER TYPE "CalcType" ADD VALUE 'FORMULA';
ALTER TYPE "CalcType" ADD VALUE 'MANUAL';

-- AlterEnum
ALTER TYPE "ComponentKind" ADD VALUE 'EMPLOYER';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PayType" ADD VALUE 'WEEKLY';
ALTER TYPE "PayType" ADD VALUE 'DAILY';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TaxTreatment" ADD VALUE 'SPECIAL_REWARD';
ALTER TYPE "TaxTreatment" ADD VALUE 'OVERTIME';

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "declarationDueDay" INTEGER NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "taxRegime" "TaxRegime" NOT NULL DEFAULT 'STANDARD';

-- AlterTable
ALTER TABLE "EmployeeDocument" ADD COLUMN     "leaveRequestId" TEXT;

-- AlterTable
ALTER TABLE "EmployeePayComponent" ADD COLUMN     "quantity" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN     "approvedDays" DOUBLE PRECISION,
ADD COLUMN     "childBirthDate" TIMESTAMP(3),
ADD COLUMN     "hours" DOUBLE PRECISION,
ADD COLUMN     "paymentStatus" "LeavePaymentStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
ADD COLUMN     "scheduleNote" TEXT,
ADD COLUMN     "schedulePercentBp" INTEGER NOT NULL DEFAULT 10000;

-- AlterTable
ALTER TABLE "LeaveType" ADD COLUMN     "allowPartTime" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "carryForward" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "category" "LeaveCategory" NOT NULL DEFAULT 'SPECIAL',
ADD COLUMN     "companyExtraDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "componentCode" TEXT,
ADD COLUMN     "legalReference" TEXT,
ADD COLUMN     "legalStatus" "LegalStatus" NOT NULL DEFAULT 'COMPANY_POLICY',
ADD COLUMN     "maxCarryForwardDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "payPercentBp" INTEGER NOT NULL DEFAULT 10000,
ADD COLUMN     "statutoryDays" DOUBLE PRECISION,
ADD COLUMN     "unit" "LeaveUnit" NOT NULL DEFAULT 'DAYS';

-- AlterTable
ALTER TABLE "PayComponent" ADD COLUMN     "aovIncluded" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "baseComponentCode" TEXT,
ADD COLUMN     "category" "ComponentCategory",
ADD COLUMN     "currency" TEXT,
ADD COLUMN     "defaultAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "defaultRateBp" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "effectiveFrom" TIMESTAMP(3),
ADD COLUMN     "effectiveTo" TIMESTAMP(3),
ADD COLUMN     "employerCost" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "formula" TEXT,
ADD COLUMN     "frequency" "ComponentFrequency" NOT NULL DEFAULT 'RECURRING',
ADD COLUMN     "glAccount" TEXT,
ADD COLUMN     "legalReference" TEXT,
ADD COLUMN     "legalStatus" "LegalStatus" NOT NULL DEFAULT 'COMPANY_POLICY',
ADD COLUMN     "libraryCode" TEXT,
ADD COLUMN     "multiplierBp" INTEGER NOT NULL DEFAULT 10000,
ADD COLUMN     "nameEn" TEXT,
ADD COLUMN     "nameNl" TEXT,
ADD COLUMN     "netEffect" "NetEffect" NOT NULL DEFAULT 'ADD',
ADD COLUMN     "pensionIncluded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unitPrice" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PayrollAdjustment" ADD COLUMN     "quantity" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "PayrollInput" ADD COLUMN     "daysWorked" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "PayrollRun" ADD COLUMN     "aovRuleSetId" TEXT,
ADD COLUMN     "legalAcknowledgedById" TEXT,
ADD COLUMN     "legalStatus" "RunLegalStatus" NOT NULL DEFAULT 'PENDING_LEGAL_VALIDATION';

-- AlterTable
ALTER TABLE "Payslip" ADD COLUMN     "aovBaseAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "aovEmployer" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "aovRuleSetId" TEXT,
ADD COLUMN     "legalStatus" "RunLegalStatus" NOT NULL DEFAULT 'PENDING_LEGAL_VALIDATION',
ADD COLUMN     "taxRuleSetId" TEXT;

-- AlterTable
ALTER TABLE "PayslipLine" ADD COLUMN     "labels" JSONB;

-- AlterTable
ALTER TABLE "TaxRuleSet" ADD COLUMN     "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "calcMethod" "TaxCalcMethod" NOT NULL DEFAULT 'ANNUALIZED',
ADD COLUMN     "citations" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "effectiveTo" TIMESTAMP(3),
ADD COLUMN     "lumpSumMode" "LumpSumMode" NOT NULL DEFAULT 'PERCENT_CAPPED',
ADD COLUMN     "lumpSumMonthly" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "regime" "TaxRegime" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "taxFreeAnnual" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "taxFreeMonthly" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "verificationStatus" "LegalStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
ADD COLUMN     "verifiedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ComponentLibrary" (
    "code" TEXT NOT NULL,
    "category" "ComponentCategory" NOT NULL,
    "kind" "ComponentKind" NOT NULL,
    "nameNl" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "calcType" "CalcType" NOT NULL DEFAULT 'FIXED',
    "taxTreatment" "TaxTreatment" NOT NULL DEFAULT 'TAXABLE',
    "multiplierBp" INTEGER NOT NULL DEFAULT 10000,
    "aovIncluded" BOOLEAN NOT NULL DEFAULT true,
    "pensionIncluded" BOOLEAN NOT NULL DEFAULT false,
    "netEffect" "NetEffect" NOT NULL DEFAULT 'ADD',
    "employerCost" BOOLEAN NOT NULL DEFAULT true,
    "preTax" BOOLEAN NOT NULL DEFAULT false,
    "frequency" "ComponentFrequency" NOT NULL DEFAULT 'RECURRING',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "systemCode" TEXT,
    "legalStatus" "LegalStatus" NOT NULL DEFAULT 'COMPANY_POLICY',
    "legalReference" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ComponentLibrary_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "LegalSource" (
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publication" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "effectiveFrom" TIMESTAMP(3),
    "subject" TEXT NOT NULL,
    "articles" JSONB NOT NULL DEFAULT '[]',
    "url" TEXT,
    "verificationStatus" "LegalStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalSource_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "AovRuleSet" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SRD',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "verifiedUntil" TIMESTAMP(3),
    "rateBp" INTEGER NOT NULL,
    "base" "AovBase" NOT NULL DEFAULT 'TAXABLE_WAGE',
    "franchiseMonthly" INTEGER NOT NULL DEFAULT 0,
    "minMonthly" INTEGER,
    "maxMonthly" INTEGER,
    "employeeShareBp" INTEGER NOT NULL DEFAULT 10000,
    "exemptFromAge" INTEGER,
    "verificationStatus" "LegalStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
    "citations" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AovRuleSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Declaration" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "DeclarationType" NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "supplementaryOfId" TEXT,
    "status" "DeclarationStatus" NOT NULL DEFAULT 'IN_PREPARATION',
    "currency" TEXT NOT NULL DEFAULT 'SRD',
    "deadline" TIMESTAMP(3) NOT NULL,
    "employeeCount" INTEGER NOT NULL DEFAULT 0,
    "totalTaxable" INTEGER NOT NULL DEFAULT 0,
    "totalWageTax" INTEGER NOT NULL DEFAULT 0,
    "totalAov" INTEGER NOT NULL DEFAULT 0,
    "previousAdjustments" INTEGER NOT NULL DEFAULT 0,
    "totalPayable" INTEGER NOT NULL DEFAULT 0,
    "legalPending" BOOLEAN NOT NULL DEFAULT true,
    "legalAcknowledgedById" TEXT,
    "snapshot" JSONB NOT NULL DEFAULT '{}',
    "runIds" TEXT[],
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "downloadedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "submissionReference" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "paidAt" TIMESTAMP(3),
    "paymentReference" TEXT,
    "receiptStorageKey" TEXT,
    "receiptFileName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Declaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeclarationFile" (
    "id" TEXT NOT NULL,
    "declarationId" TEXT NOT NULL,
    "kind" "DeclarationFileKind" NOT NULL,
    "format" "FileFormat" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "size" INTEGER NOT NULL,
    "generatedById" TEXT,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeclarationFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeclarationEvent" (
    "id" TEXT NOT NULL,
    "declarationId" TEXT NOT NULL,
    "fromStatus" "DeclarationStatus",
    "toStatus" "DeclarationStatus" NOT NULL,
    "userId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeclarationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Declaration_companyId_status_idx" ON "Declaration"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Declaration_companyId_type_year_month_version_key" ON "Declaration"("companyId", "type", "year", "month", "version");

-- CreateIndex
CREATE INDEX "Notification_companyId_readAt_idx" ON "Notification"("companyId", "readAt");

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_aovRuleSetId_fkey" FOREIGN KEY ("aovRuleSetId") REFERENCES "AovRuleSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AovRuleSet" ADD CONSTRAINT "AovRuleSet_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Declaration" ADD CONSTRAINT "Declaration_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeclarationFile" ADD CONSTRAINT "DeclarationFile_declarationId_fkey" FOREIGN KEY ("declarationId") REFERENCES "Declaration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeclarationEvent" ADD CONSTRAINT "DeclarationEvent_declarationId_fkey" FOREIGN KEY ("declarationId") REFERENCES "Declaration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

