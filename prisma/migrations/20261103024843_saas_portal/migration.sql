-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('NEW_REQUEST', 'IN_REVIEW', 'ACTIVE', 'TRIAL', 'PAYMENT_DUE', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('SUPER_ADMIN', 'SAAS_ADMIN');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('INVOICE', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID', 'CREDITED', 'VOID');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('NEW', 'IN_REVIEW', 'INFO_REQUESTED', 'DEMO_SCHEDULED', 'APPROVED', 'REJECTED', 'CONVERTED');

-- AlterEnum
ALTER TYPE "ContactRequestType" ADD VALUE 'REGISTRATION';

-- AlterTable
ALTER TABLE "ContactRequest" ADD COLUMN     "adminNote" TEXT,
ADD COLUMN     "currency" TEXT,
ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "decidedById" TEXT,
ADD COLUMN     "demoAt" TIMESTAMP(3),
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "organizationName" TEXT,
ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "status" "RequestStatus" NOT NULL DEFAULT 'NEW';

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "address" TEXT,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'Suriname',
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "registrationNumber" TEXT,
ADD COLUMN     "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "platformRole" "PlatformRole";

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameNl" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "descriptionNl" TEXT,
    "descriptionEn" TEXT,
    "monthlyPrice" INTEGER,
    "yearlyPrice" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'SRD',
    "minEmployees" INTEGER,
    "maxEmployees" INTEGER,
    "modules" JSONB NOT NULL DEFAULT '[]',
    "featuresNl" JSONB NOT NULL DEFAULT '[]',
    "featuresEn" JSONB NOT NULL DEFAULT '[]',
    "trialDays" INTEGER NOT NULL DEFAULT 30,
    "discountBp" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "popular" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "priceMonthly" INTEGER,
    "priceYearly" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'SRD',
    "maxEmployees" INTEGER,
    "extraEmployees" INTEGER NOT NULL DEFAULT 0,
    "discountBp" INTEGER NOT NULL DEFAULT 0,
    "discountNote" TEXT,
    "trialStart" TIMESTAMP(3),
    "trialEnd" TIMESTAMP(3),
    "trialReminderAt" TIMESTAMP(3),
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextInvoiceDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "suspendedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionEvent" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "kind" "InvoiceKind" NOT NULL DEFAULT 'INVOICE',
    "organizationId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "creditForId" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "currency" TEXT NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "amountPaid" INTEGER NOT NULL DEFAULT 0,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "lines" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "methodCode" TEXT NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "code" TEXT NOT NULL,
    "nameNl" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "instructions" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "InvoiceCounter" (
    "series" TEXT NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceCounter_pkey" PRIMARY KEY ("series")
);

-- CreateTable
CREATE TABLE "SupportAccess" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "SupportAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");

-- CreateIndex
CREATE INDEX "Subscription_organizationId_status_idx" ON "Subscription"("organizationId", "status");

-- CreateIndex
CREATE INDEX "SubscriptionEvent_subscriptionId_createdAt_idx" ON "SubscriptionEvent"("subscriptionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_status_idx" ON "Invoice"("organizationId", "status");

-- CreateIndex
CREATE INDEX "SupportAccess_adminUserId_endedAt_idx" ON "SupportAccess"("adminUserId", "endedAt");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportAccess" ADD CONSTRAINT "SupportAccess_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Default subscription plans (same content as the website pricing section); fully editable by administrators.
INSERT INTO "Plan" ("id","code","nameNl","nameEn","descriptionNl","descriptionEn","monthlyPrice","currency","minEmployees","maxEmployees","modules","featuresNl","featuresEn","trialDays","popular","sortOrder","updatedAt") VALUES ('plan_starter','starter','Starter','Starter','1–10 medewerkers','1–10 employees','75000','SRD',1,'10','["employees", "payroll", "payslips", "reports_basic"]'::jsonb,'["1–10 medewerkers", "Personeelsbeheer", "Salarisverwerking", "Digitale loonstroken", "Basisrapportages"]'::jsonb,'["1\u201310 employees", "Employee management", "Payroll processing", "Digital payslips", "Basic reports"]'::jsonb,30,false,1,now()) ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Plan" ("id","code","nameNl","nameEn","descriptionNl","descriptionEn","monthlyPrice","currency","minEmployees","maxEmployees","modules","featuresNl","featuresEn","trialDays","popular","sortOrder","updatedAt") VALUES ('plan_business','business','Business','Business','11–30 medewerkers','11–30 employees','150000','SRD',11,'30','["employees", "payroll", "payslips", "reports", "components", "leave", "bonuses"]'::jsonb,'["11–30 medewerkers", "Alles uit Starter", "Vaste en variabele looncomponenten", "Verlofbeheer", "Vakantietoelage en bonussen", "Uitgebreide rapportages"]'::jsonb,'["11\u201330 employees", "Everything in Starter", "Fixed and variable pay components", "Leave management", "Holiday allowance and bonuses", "Extended reports"]'::jsonb,30,true,2,now()) ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Plan" ("id","code","nameNl","nameEn","descriptionNl","descriptionEn","monthlyPrice","currency","minEmployees","maxEmployees","modules","featuresNl","featuresEn","trialDays","popular","sortOrder","updatedAt") VALUES ('plan_professional','professional','Professional','Professional','31–75 medewerkers','31–75 employees','275000','SRD',31,'75','["employees", "payroll", "payslips", "reports", "components", "leave", "bonuses", "hr_advanced", "multicurrency", "exports", "priority_support"]'::jsonb,'["31–75 medewerkers", "Alles uit Business", "Geavanceerde HR-functionaliteiten", "Multicurrency", "Uitgebreide exports", "Prioriteit bij ondersteuning"]'::jsonb,'["31\u201375 employees", "Everything in Business", "Advanced HR features", "Multicurrency", "Extended exports", "Priority support"]'::jsonb,30,false,3,now()) ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Plan" ("id","code","nameNl","nameEn","descriptionNl","descriptionEn","monthlyPrice","currency","minEmployees","maxEmployees","modules","featuresNl","featuresEn","trialDays","popular","sortOrder","updatedAt") VALUES ('plan_enterprise','enterprise','Enterprise','Enterprise','75+ medewerkers','75+ employees',NULL,'SRD',76,NULL,'["employees", "payroll", "payslips", "reports", "components", "leave", "bonuses", "hr_advanced", "multicurrency", "exports", "priority_support", "multi_company", "custom_setup", "training", "integrations"]'::jsonb,'["75+ medewerkers", "Meerdere administraties", "Aangepaste inrichting", "Implementatie en training", "Maatwerk en integraties"]'::jsonb,'["75+ employees", "Multiple payroll administrations", "Custom configuration", "Implementation and training", "Custom development and integrations"]'::jsonb,30,false,4,now()) ON CONFLICT ("code") DO NOTHING;

-- Manual payment method (payments are registered by an administrator; no provider integration).
INSERT INTO "PaymentMethod" ("code","nameNl","nameEn","isActive") VALUES ('BANK_TRANSFER','Bankoverschrijving','Bank transfer',true) ON CONFLICT ("code") DO NOTHING;

-- Existing platform administrators become super administrators.
UPDATE "User" SET "platformRole" = 'SUPER_ADMIN' WHERE "isPlatformAdmin" = true AND "platformRole" IS NULL;

-- Existing website requests keep their handled state.
UPDATE "ContactRequest" SET "status" = 'APPROVED', "decidedAt" = "createdAt" WHERE "handled" = true;
