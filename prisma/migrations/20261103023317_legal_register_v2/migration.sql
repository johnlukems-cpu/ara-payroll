-- CreateEnum
CREATE TYPE "LegalSourceState" AS ENUM ('IN_FORCE', 'AMENDED', 'REPEALED', 'TO_VERIFY');

-- AlterEnum
ALTER TYPE "LegalStatus" ADD VALUE 'PARTIALLY_VERIFIED';

-- AlterTable
ALTER TABLE "AovRuleSet" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedById" TEXT,
ADD COLUMN     "verifiedReviewer" TEXT;

-- AlterTable
ALTER TABLE "ContributionScheme" ADD COLUMN     "minBaseMonthly" INTEGER;

-- AlterTable
ALTER TABLE "LegalSource" ADD COLUMN     "article" TEXT,
ADD COLUMN     "components" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "evidence" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "history" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "lastAmendment" TEXT,
ADD COLUMN     "lastCheckedAt" TIMESTAMP(3),
ADD COLUMN     "state" "LegalSourceState" NOT NULL DEFAULT 'TO_VERIFY',
ADD COLUMN     "summary" TEXT;

-- AlterTable
ALTER TABLE "PayrollRun" ADD COLUMN     "legalSnapshot" JSONB;

-- AlterTable
ALTER TABLE "TaxRuleSet" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedById" TEXT,
ADD COLUMN     "verifiedReviewer" TEXT;

-- Existing rule sets were approved when created.
UPDATE "TaxRuleSet" SET "approvedAt" = "createdAt" WHERE "approvalStatus" = 'APPROVED' AND "approvedAt" IS NULL;
UPDATE "AovRuleSet" SET "approvedAt" = "createdAt" WHERE "approvalStatus" = 'APPROVED' AND "approvedAt" IS NULL;
