/**
 * Integration tests (PostgreSQL) for contribution schemes: employee/employer shares in payroll, individual
 * rates and opt-out, currency conversion, double-deduction guard and unchanged historical payslips.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { PrismaClient, type Prisma } from "@prisma/client";
import { calculateRun } from "@/lib/payroll/service";
import { DEFAULT_SR_RULES } from "@/lib/payroll/defaults";
import { seedCompanyDefaults } from "@/lib/server/company-setup";
import { contributionReport } from "@/lib/server/reports";
import { missingStatutoryContributions } from "@/lib/server/pay-components";

const db = new PrismaClient();
const SRD = (v: number) => Math.round(v * 100);
const d = (s: string) => new Date(`${s}T00:00:00Z`);
let companyId: string;
let orgId: string;
let anna: string;
let bob: string;

const slip = (runId: string, employeeId: string) => db.payslip.findFirstOrThrow({ where: { runId, employeeId }, include: { lines: true } });
const line = (s: { lines: { code: string; amount: number }[] }, code: string) => s.lines.find((l) => l.code === code)?.amount;

beforeAll(async () => {
  const org = await db.organization.create({ data: { name: `IT contrib ${Date.now()}` } });
  orgId = org.id;
  const c = await db.company.create({ data: { name: "Contributions Co", organizationId: org.id } });
  companyId = c.id;
  await db.$transaction((tx) => seedCompanyDefaults(tx, c.id));
  await db.taxRuleSet.create({
    data: {
      companyId, name: "IT rules", effectiveFrom: d("2020-01-01"), ...DEFAULT_SR_RULES,
      brackets: DEFAULT_SR_RULES.brackets as unknown as Prisma.InputJsonValue,
      overtimeBrackets: DEFAULT_SR_RULES.overtimeBrackets as unknown as Prisma.InputJsonValue,
    },
  });
  const mk = async (n: string, salary: number, pensionBp = 0) => (await db.employee.create({
    data: {
      companyId, employeeNumber: n, firstName: n, lastName: "Test", hireDate: d("2020-01-01"),
      contracts: { create: { contractType: "PERMANENT", payType: "MONTHLY", startDate: d("2020-01-01"), baseSalary: SRD(salary), salaryCurrency: "SRD", pensionEmployeeBp: pensionBp, pensionEmployerBp: pensionBp } },
    },
  })).id;
  anna = await mk("Anna", 20_000, 300);
  bob = await mk("Bob", 10_000);
});

afterAll(async () => {
  await db.organization.delete({ where: { id: orgId } });
  await db.taxRuleSet.deleteMany({ where: { companyId } });
  await db.$disconnect();
});

describe("contribution schemes in payroll", () => {
  it("creates the three default schemes inactive and without rates", async () => {
    const schemes = await db.contributionScheme.findMany({ where: { companyId } });
    expect(schemes.map((s) => s.type).sort()).toEqual(["FVO", "HEALTH", "PENSION"]);
    for (const s of schemes) expect([s.isActive, s.employeeRateBp, s.employerRateBp, s.employeeAmount, s.employerAmount]).toEqual([false, 0, 0, 0, 0]);
    const run = await db.payrollRun.create({ data: { companyId, year: 2026, month: 1, payDate: d("2026-01-25") } });
    await calculateRun(run.id);
    expect((await slip(run.id, anna)).lines.some((l) => /^(HEALTH|PENSION|FVO)-/.test(l.code))).toBe(false);
  });

  it("blocks finalising while statutory schemes are not configured and approved, and ignores unapproved schemes", async () => {
    const missing = await missingStatutoryContributions(companyId, 2026, 1);
    expect(missing.map((m) => m.type)).toEqual(["HEALTH", "FVO"]); // statutory by default; voluntary pension does not block
    // Rates set and even marked active, but not approved: not used in payroll, still blocking.
    await db.contributionScheme.updateMany({ where: { companyId, type: "HEALTH" }, data: { isActive: true, employeeRateBp: 200, employerRateBp: 300, effectiveFrom: d("2026-01-01") } });
    const run = await db.payrollRun.findFirstOrThrow({ where: { companyId, month: 1 } });
    await calculateRun(run.id);
    expect((await slip(run.id, anna)).lines.some((l) => l.code.startsWith("HEALTH-"))).toBe(false);
    expect((await missingStatutoryContributions(companyId, 2026, 1)).map((m) => m.type)).toEqual(["HEALTH", "FVO"]);
    // Marking FVO as not applicable (explicit decision) removes it from the blocking list.
    await db.contributionScheme.updateMany({ where: { companyId, type: "FVO" }, data: { notApplicable: true, notApplicableReason: "test" } });
    expect((await missingStatutoryContributions(companyId, 2026, 1)).map((m) => m.type)).toEqual(["HEALTH"]);
    await db.contributionScheme.updateMany({ where: { companyId, type: "FVO" }, data: { notApplicable: false, notApplicableReason: null } });
  });

  it("processes employee and employer shares separately, with individual rates, opt-out and currency conversion", async () => {
    await db.contributionScheme.updateMany({ where: { companyId, type: "HEALTH" }, data: { isActive: true, approvedAt: new Date(), method: "PERCENTAGE", employeeRateBp: 200, employerRateBp: 300, effectiveFrom: d("2026-01-01") } });
    await db.contributionScheme.updateMany({ where: { companyId, type: "PENSION" }, data: { isActive: true, approvedAt: new Date(), employeeRateBp: 400, employerRateBp: 600, employeeTax: "PRE_TAX", effectiveFrom: d("2026-01-01") } });
    // FVO: fixed USD amounts, converted at the approved period-end rate.
    await db.contributionScheme.updateMany({ where: { companyId, type: "FVO" }, data: { isActive: true, approvedAt: new Date(), method: "FIXED", employeeAmount: 200, employerAmount: 500, currency: "USD", effectiveFrom: d("2026-01-01") } });
    await db.exchangeRate.create({ data: { companyId, baseCurrency: "USD", quoteCurrency: "SRD", rate: "40", effectiveDate: d("2026-01-01"), status: "APPROVED" } });
    const health = await db.contributionScheme.findFirstOrThrow({ where: { companyId, type: "HEALTH" } });
    const pension = await db.contributionScheme.findFirstOrThrow({ where: { companyId, type: "PENSION" } });
    await db.employeeContribution.create({ data: { employeeId: bob, schemeId: health.id, employeeRateBp: 100 } }); // individual rate
    await db.employeeContribution.create({ data: { employeeId: bob, schemeId: pension.id, participates: false } }); // opted out

    const run = await db.payrollRun.create({ data: { companyId, year: 2026, month: 2, payDate: d("2026-02-25") } });
    expect(await missingStatutoryContributions(companyId, 2026, 2)).toEqual([]); // all statutory schemes approved and active
    await calculateRun(run.id);
    const a = await slip(run.id, anna);
    expect(line(a, "HEALTH-EE")).toBe(SRD(400)); // 2% of 20,000
    expect(line(a, "HEALTH-ER")).toBe(SRD(600));
    expect(line(a, "PENSION-EE")).toBe(SRD(800));
    expect(line(a, "PENSION-ER")).toBe(SRD(1_200));
    expect(line(a, "PENS")).toBeUndefined(); // contract 3% replaced by the scheme: no double deduction
    expect(line(a, "FVO-EE")).toBe(SRD(80)); // USD 2.00 × 40
    expect(line(a, "FVO-ER")).toBe(SRD(200));
    expect(a.lines.find((l) => l.code === "HEALTH-EE")).toMatchObject({ type: "DEDUCTION", group: "HEALTH", source: "CONTRIBUTION" });
    expect(a.lines.find((l) => l.code === "HEALTH-ER")).toMatchObject({ type: "EMPLOYER", group: "HEALTH" });
    // Employer shares never reduce net pay.
    const employee = SRD(400 + 800 + 80);
    const employer = SRD(600 + 1_200 + 200);
    expect(a.netPay).toBe(a.grossPay - a.totalDeductions);
    expect(a.employerCost).toBe(a.grossPay + employer + a.aovEmployer);
    expect(a.lines.filter((l) => l.type === "DEDUCTION" && /-EE$/.test(l.code)).reduce((s, l) => s + l.amount, 0)).toBe(employee);
    expect((a.conversions as { from: string }[]).some((c) => c.from === "USD")).toBe(true);
    expect(a.legalStatus).toBe("PENDING_LEGAL_VALIDATION"); // statutory schemes not verified

    const b = await slip(run.id, bob);
    expect(line(b, "HEALTH-EE")).toBe(SRD(100)); // individual 1%
    expect(line(b, "HEALTH-ER")).toBe(SRD(300));
    expect(line(b, "PENSION-EE")).toBeUndefined(); // opted out
  });

  it("refuses to calculate when a component deducts the same contribution as a scheme", async () => {
    const hc = await db.payComponent.findFirstOrThrow({ where: { companyId, libraryCode: "DED004" } });
    const a = await db.employeePayComponent.create({ data: { employeeId: bob, componentId: hc.id, amount: SRD(150), currency: "SRD", startDate: d("2026-01-01") } });
    const run = await db.payrollRun.create({ data: { companyId, year: 2026, month: 3, payDate: d("2026-03-25") } });
    await expect(calculateRun(run.id)).rejects.toMatchObject({ key: "errors.contributionDuplicate" });
    await db.employeePayComponent.delete({ where: { id: a.id } });
    await calculateRun(run.id);
  });

  it("reports employee and employer contributions and employer costs per period and per employee", async () => {
    await db.payrollRun.updateMany({ where: { companyId, month: { in: [2, 3] } }, data: { status: "APPROVED" } });
    const r = await contributionReport(companyId, 2026);
    const feb = r.months.find((m) => m.month === 2)!;
    expect(feb.healthEmployee).toBe(SRD(400 + 100));
    expect(feb.healthEmployer).toBe(SRD(600 + 300));
    expect(feb.pensionEmployer).toBe(SRD(1_200));
    expect(feb.fvoEmployer).toBe(SRD(400)); // 2 employees × USD 5
    const slips = await db.payslip.findMany({ where: { run: { companyId, month: 2 } } });
    expect(feb.employmentCost).toBe(slips.reduce((s, p) => s + p.employerCost, 0));
    expect(feb.employerCosts).toBe(feb.employmentCost - feb.gross);
    const annaRow = r.employees.find((e) => e.employeeId === anna)!;
    expect(annaRow.pensionEmployee).toBe(SRD(800 * 2));
  });

  it("keeps approved payslips unchanged when a scheme rate changes", async () => {
    const run = await db.payrollRun.findFirstOrThrow({ where: { companyId, month: 2 } });
    const before = await slip(run.id, anna);
    await db.contributionScheme.updateMany({ where: { companyId, type: "HEALTH" }, data: { employeeRateBp: 900 } });
    await expect(calculateRun(run.id)).rejects.toMatchObject({ key: "errors.runLocked" });
    const after = await slip(run.id, anna);
    expect(line(after, "HEALTH-EE")).toBe(line(before, "HEALTH-EE"));
    expect(after.netPay).toBe(before.netPay);
  });
});
