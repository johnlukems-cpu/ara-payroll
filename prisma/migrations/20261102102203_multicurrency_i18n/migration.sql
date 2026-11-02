-- CreateEnum
CREATE TYPE "RateSource" AS ENUM ('MANUAL', 'API');

-- CreateEnum
CREATE TYPE "RateStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "rateAllowApi" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rateRequireApproval" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "salaryCurrency" TEXT NOT NULL DEFAULT 'SRD';

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "paymentCurrency" TEXT;

-- AlterTable
ALTER TABLE "EmployeePayComponent" ADD COLUMN     "currency" TEXT;

-- AlterTable
ALTER TABLE "PayrollAdjustment" ADD COLUMN     "currency" TEXT;

-- AlterTable
ALTER TABLE "PayrollRun" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'SRD';

-- AlterTable
ALTER TABLE "Payslip" ADD COLUMN     "aovBase" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "baseCurrency" TEXT NOT NULL DEFAULT 'SRD',
ADD COLUMN     "calcCurrency" TEXT NOT NULL DEFAULT 'SRD',
ADD COLUMN     "conversions" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "employerCostBase" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "grossBase" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "netBase" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "netPayPayment" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paymentCurrency" TEXT NOT NULL DEFAULT 'SRD',
ADD COLUMN     "salaryCurrency" TEXT NOT NULL DEFAULT 'SRD',
ADD COLUMN     "wageTaxBase" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PayslipLine" ADD COLUMN     "originalAmount" INTEGER,
ADD COLUMN     "originalCurrency" TEXT;

-- AlterTable
ALTER TABLE "TaxRuleSet" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'SRD';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'nl';

-- CreateTable
CREATE TABLE "Currency" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNl" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL DEFAULT 2,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Currency_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "baseCurrency" TEXT NOT NULL,
    "quoteCurrency" TEXT NOT NULL,
    "rate" DECIMAL(24,10) NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "source" "RateSource" NOT NULL DEFAULT 'MANUAL',
    "provider" TEXT,
    "status" "RateStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "ExchangeRate_baseCurrency_quoteCurrency_effectiveDate_idx" ON "ExchangeRate"("baseCurrency", "quoteCurrency", "effectiveDate");

-- CreateIndex
CREATE INDEX "ExchangeRate_companyId_status_idx" ON "ExchangeRate"("companyId", "status");

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Data backfill ─────────────────────────────────────────────────────────────
-- Existing payroll was calculated entirely in SRD: preserve values in the new columns.
UPDATE "Payslip" SET
  "netPayPayment" = "netPay",
  "grossBase" = "grossPay",
  "wageTaxBase" = "wageTax",
  "aovBase" = "aov",
  "netBase" = "netPay",
  "employerCostBase" = "employerCost";

UPDATE "PayrollRun" r SET "currency" = c."currency" FROM "Company" c WHERE c."id" = r."companyId";
UPDATE "Contract" k SET "salaryCurrency" = c."currency" FROM "Employee" e JOIN "Company" c ON c."id" = e."companyId" WHERE e."id" = k."employeeId";

-- Initial ISO 4217 currency register.
INSERT INTO "Currency" ("code", "name", "nameNl", "symbol", "decimals", "isActive", "sortOrder") VALUES
  ('SRD', 'Surinamese Dollar', 'Surinaamse dollar', 'SRD', 2, true, 1),
  ('USD', 'United States Dollar', 'Amerikaanse dollar', 'US$', 2, true, 2),
  ('EUR', 'Euro', 'Euro', '€', 2, true, 3),
  ('GYD', 'Guyanese Dollar', 'Guyaanse dollar', 'G$', 2, true, 4),
  ('TTD', 'Trinidad and Tobago Dollar', 'Trinidad en Tobago-dollar', 'TT$', 2, true, 5),
  ('GBP', 'British Pound', 'Britse pond', '£', 2, true, 6),
  ('CAD', 'Canadian Dollar', 'Canadese dollar', 'CA$', 2, true, 7),
  ('XCD', 'Eastern Caribbean Dollar', 'Oost-Caribische dollar', 'EC$', 2, true, 8)
ON CONFLICT ("code") DO NOTHING;
