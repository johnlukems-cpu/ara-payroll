-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('EMPLOYMENT_CONTRACT', 'ADDENDUM', 'IDENTITY', 'DIPLOMA', 'CERTIFICATE', 'BANK', 'TAX', 'PENSION', 'LEAVE', 'OTHER');

-- AlterTable
ALTER TABLE "EmployeeDocument" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedById" TEXT,
ADD COLUMN     "category" "DocumentCategory" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "remindedAt" TIMESTAMP(3),
ADD COLUMN     "reminderCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "sentById" TEXT;

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "maxUsers" INTEGER,
ADD COLUMN     "storageLimitMb" INTEGER,
ADD COLUMN     "supportLevel" TEXT;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "maxUsers" INTEGER,
ADD COLUMN     "storageLimitMb" INTEGER,
ADD COLUMN     "supportLevel" TEXT;

-- CreateTable
CREATE TABLE "PayrollCorrection" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "userId" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveBalanceAdjustment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "days" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveBalanceAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayrollCorrection_runId_createdAt_idx" ON "PayrollCorrection"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "LeaveBalanceAdjustment_employeeId_year_idx" ON "LeaveBalanceAdjustment"("employeeId", "year");

-- AddForeignKey
ALTER TABLE "PayrollCorrection" ADD CONSTRAINT "PayrollCorrection_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalanceAdjustment" ADD CONSTRAINT "LeaveBalanceAdjustment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalanceAdjustment" ADD CONSTRAINT "LeaveBalanceAdjustment_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
