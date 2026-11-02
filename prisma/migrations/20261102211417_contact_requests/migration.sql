-- CreateEnum
CREATE TYPE "ContactRequestType" AS ENUM ('DEMO', 'QUOTE');

-- CreateTable
CREATE TABLE "ContactRequest" (
    "id" TEXT NOT NULL,
    "type" "ContactRequestType" NOT NULL,
    "plan" TEXT,
    "name" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "employees" INTEGER,
    "message" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'nl',
    "handled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactRequest_handled_createdAt_idx" ON "ContactRequest"("handled", "createdAt");
