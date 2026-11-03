-- AlterTable
ALTER TABLE "ContributionScheme" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "notApplicable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notApplicableReason" TEXT;

-- Schemes that were already active before approval existed keep working (treated as approved at migration time).
UPDATE "ContributionScheme" SET "approvedAt" = now() WHERE "isActive" = true AND "approvedAt" IS NULL;
