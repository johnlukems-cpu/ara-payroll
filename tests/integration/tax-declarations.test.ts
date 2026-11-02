/**
 * Integration tests (real PostgreSQL) for tax rule selection, AOV, parental leave in payroll,
 * legal validation status and declarations. Uses clearly marked technical rule sets.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { PrismaClient, type Prisma } from "@prisma/client";
import { calculateRun, findRuleSet, isLegallyValid } from "@/lib/payroll/service";
import { SB_2024_2, AOV_RESEARCH } from "@/lib/payroll/defaults";
import { seedCompanyDefaults } from "@/lib/server/company-setup";
import { loadDeclaration, prepareMonthlyDeclaration, recalculateDeclaration, transition } from "@/lib/server/declarations";

const db = new PrismaClient();
const SRD = (v: number) => Math.round(v * 100);
const json = (v: unknown) => v as Prisma.InputJsonValue;
let companyId: string;
let otherCompanyId: string;
let orgId: string;
let userId: string;
let empId: string;

async function makeCompany(name: string) {
  const c = await db.company.create({ data: { name, organizationId: orgId } });
  await db.$transaction((tx) => seedCompanyDefaults(tx, c.id, "nl"));
  return c.id;
}

beforeAll(async () => {
  orgId = (await db.organization.create({ data: { name: `TaxIT ${Date.now()}` } })).id;
  userId = (await db.user.create({ data: { email: `taxit-${Date.now()}@test.local`, name: "Tax IT", passwordHash: "x" } })).id;
  companyId = await makeCompany("Tax IT Co");
  otherCompanyId = await makeCompany("Other Co");
  const r = SB_2024_2.rules;
  // Technical rule sets (company-specific so they take precedence): an old version and the S.B. 2024 no. 2 structure.
  await db.taxRuleSet.create({ data: { companyId, name: "TECH old 2023", effectiveFrom: new Date("2023-01-01"), brackets: json([{ upTo: null, rateBp: 1000 }]), overtimeBrackets: json(r.overtimeBrackets), taxCreditMonthly: 0, lumpSumRateBp: 0, lumpSumCapAnnual: 0, aovRateBp: 0, aovFranchiseMonthly: 0, childAllowanceExempt: 0, childAllowanceMaxChildren: 0, bonusExemptAnnual: 0 } });
  await db.taxRuleSet.create({
    data: {
      companyId, name: "TECH SB 2024-2", effectiveFrom: new Date("2024-01-01"), brackets: json(r.brackets), overtimeBrackets: json(r.overtimeBrackets),
      taxFreeAnnual: r.taxFreeAnnual!, taxFreeMonthly: r.taxFreeMonthly!, lumpSumMode: "FIXED", lumpSumMonthly: r.lumpSumMonthly!, lumpSumCapAnnual: r.lumpSumCapAnnual,
      lumpSumRateBp: 0, taxCreditMonthly: 0, aovRateBp: 400, aovFranchiseMonthly: 0, childAllowanceExempt: r.childAllowanceExempt, childAllowanceMaxChildren: 4, bonusExemptAnnual: r.bonusExemptAnnual,
    },
  });
  const a = AOV_RESEARCH.rules;
  await db.aovRuleSet.create({ data: { companyId, name: "TECH AOV", effectiveFrom: new Date("2024-01-01"), rateBp: a.rateBp, base: a.base, franchiseMonthly: 0, employeeShareBp: 10000, exemptFromAge: 60 } });
  empId = (await db.employee.create({
    data: {
      companyId, employeeNumber: "1", firstName: "Maya", lastName: "Test", hireDate: new Date("2020-01-01"), dateOfBirth: new Date("1990-05-01"),
      contracts: { create: { contractType: "PERMANENT", payType: "MONTHLY", startDate: new Date("2020-01-01"), baseSalary: SRD(21_750) } },
    },
  })).id;
  await db.employee.create({
    data: {
      companyId, employeeNumber: "2", firstName: "Senior", lastName: "Test", hireDate: new Date("2010-01-01"), dateOfBirth: new Date("1960-01-01"),
      contracts: { create: { contractType: "PERMANENT", payType: "MONTHLY", startDate: new Date("2010-01-01"), baseSalary: SRD(15_000) } },
    },
  });
});

afterAll(async () => {
  await db.taxRuleSet.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
  await db.organization.delete({ where: { id: orgId } });
  await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});

describe("historical rule selection", () => {
  it("selects the rule set effective in the payroll period", async () => {
    expect((await findRuleSet(companyId, new Date("2023-06-30")))?.name).toBe("TECH old 2023");
    expect((await findRuleSet(companyId, new Date("2026-06-30")))?.name).toBe("TECH SB 2024-2");
  });
  it("treats unverified rules as pending legal validation", async () => {
    const rs = await findRuleSet(companyId, new Date("2026-06-30"));
    expect(isLegallyValid(rs, new Date("2026-06-30"))).toBe(false);
    expect(isLegallyValid({ verificationStatus: "VERIFIED", verifiedUntil: new Date("2026-03-31") }, new Date("2026-06-30"))).toBe(false);
    expect(isLegallyValid({ verificationStatus: "VERIFIED", verifiedUntil: null }, new Date("2026-06-30"))).toBe(true);
  });
});

describe("payroll with tax rules, AOV and parental leave", () => {
  let runId: string;
  beforeAll(async () => {
    const oud = await db.leaveType.findFirstOrThrow({ where: { companyId, code: "OUD" } });
    await db.leaveType.update({ where: { id: oud.id }, data: { payPercentBp: 6000 } });
    // Approved parental leave Mon 4 – Fri 8 May 2026 (5 working days), 60% paid → 40% of 5 daily wages deducted.
    await db.leaveRequest.create({ data: { employeeId: empId, leaveTypeId: oud.id, startDate: new Date("2026-05-04"), endDate: new Date("2026-05-08"), days: 5, approvedDays: 5, status: "APPROVED", paymentStatus: "PARTIALLY_PAID" } });
    // A pending request must not affect payroll.
    await db.leaveRequest.create({ data: { employeeId: empId, leaveTypeId: oud.id, startDate: new Date("2026-05-18"), endDate: new Date("2026-05-22"), days: 5, status: "PENDING" } });
    runId = (await db.payrollRun.create({ data: { companyId, year: 2026, month: 5, payDate: new Date("2026-05-25") } })).id;
    await calculateRun(runId);
  });

  it("applies only approved leave as a separate line, per the leave policy", async () => {
    const slip = await db.payslip.findFirstOrThrow({ where: { runId, employeeId: empId }, include: { lines: true } });
    const leave = slip.lines.find((l) => l.code === "LEV006");
    expect(leave).toMatchObject({ amount: -SRD(2_000), quantity: 5 }); // daily 1,000 × 5 × 40%
    expect(slip.grossPay).toBe(SRD(19_750));
  });

  it("calculates wage tax per S.B. 2024 no. 2 and AOV separately", async () => {
    const slip = await db.payslip.findFirstOrThrow({ where: { runId, employeeId: empId } });
    // zuiver 19,750 − 400 = 19,350 → ×12 = 232,200 − 108,000 = 124,200 → 3,360 + 7,560 + 40,200×28% (11,256) = 22,176 → 1,848/month
    expect(slip.wageTax).toBe(SRD(1_848));
    expect(slip.aov).toBe(SRD(774));
    expect(slip.legalStatus).toBe("PENDING_LEGAL_VALIDATION");
    expect(slip.taxRuleSetId).toBeTruthy();
    expect(slip.aovRuleSetId).toBeTruthy();
  });

  it("exempts employees aged 60+ from AOV", async () => {
    const slip = await db.payslip.findFirstOrThrow({ where: { runId, employeeNumber: "2" } });
    expect(slip.aov).toBe(0);
    expect(slip.wageTax).toBeGreaterThan(0);
  });

  it("prepares the declaration after approval and protects it", async () => {
    await db.payrollRun.update({ where: { id: runId }, data: { status: "APPROVED" } });
    const { declaration, created } = await prepareMonthlyDeclaration(companyId, 2026, 5, userId);
    expect(created).toBe(true);
    expect(declaration.status).toBe("CALCULATED");
    expect(declaration.totalWageTax).toBe(SRD(1_848) + (await db.payslip.findFirstOrThrow({ where: { runId, employeeNumber: "2" } })).wageTax);
    expect(declaration.legalPending).toBe(true);
    expect(declaration.deadline.toISOString().slice(0, 10)).toBe("2026-06-10");
    expect(await db.notification.count({ where: { companyId, type: "declaration.draft" } })).toBe(1);

    const reviewed = await transition(declaration, "submitForReview", userId);
    const approved = await transition(reviewed, "approve", userId);
    expect(approved.status).toBe("APPROVED");
    await expect(transition(approved, "recordSubmission", userId)).rejects.toThrow();
    // Approved declarations are never changed by later automatic preparation.
    const again = await prepareMonthlyDeclaration(companyId, 2026, 5, userId);
    expect(again.locked).toBe(true);
    await expect(recalculateDeclaration(approved, userId)).rejects.toThrow();
    const events = await db.declarationEvent.findMany({ where: { declarationId: declaration.id } });
    expect(events.map((e) => e.toStatus)).toEqual(["CALCULATED", "UNDER_REVIEW", "APPROVED"]);
  });

  it("isolates tenants", async () => {
    const d = await db.declaration.findFirstOrThrow({ where: { companyId } });
    await expect(loadDeclaration(otherCompanyId, d.id)).rejects.toThrow();
    expect(await db.declaration.count({ where: { companyId: otherCompanyId } })).toBe(0);
  });
});
