/**
 * Integration tests (PostgreSQL): new companies get FVO and pension pre-configured from the verified statutory
 * rules (S.B. 2019 no. 64 art. 12 lid 4; WAP 2014 art. 8 and S.B. 2023 no. 118); health insurance remains to be
 * configured from the company's own insurance policy. The amounts are checked on a calculated payslip.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { PrismaClient, type Prisma } from "@prisma/client";
import { calculateRun } from "@/lib/payroll/service";
import { DEFAULT_SR_RULES } from "@/lib/payroll/defaults";
import { seedCompanyDefaults } from "@/lib/server/company-setup";
import { missingStatutoryContributions } from "@/lib/server/pay-components";
import { pensionRateBp } from "@/lib/payroll/statutory";
import { schemeIssues } from "@/lib/payroll/contributions";

const db = new PrismaClient();
const SRD = (v: number) => Math.round(v * 100);
const d = (s: string) => new Date(`${s}T00:00:00Z`);
let orgId: string;
let companyId: string;
const year = new Date().getUTCFullYear();

beforeAll(async () => {
  orgId = (await db.organization.create({ data: { name: `IT statutory ${Date.now()}` } })).id;
  companyId = (await db.company.create({ data: { name: "Statutory Co", organizationId: orgId, currency: "SRD" } })).id;
  await db.$transaction((tx) => seedCompanyDefaults(tx, companyId, "nl"));
  await db.taxRuleSet.create({
    data: {
      companyId, name: "IT rules", effectiveFrom: d("2020-01-01"), ...DEFAULT_SR_RULES,
      brackets: DEFAULT_SR_RULES.brackets as unknown as Prisma.InputJsonValue,
      overtimeBrackets: DEFAULT_SR_RULES.overtimeBrackets as unknown as Prisma.InputJsonValue,
    },
  });
  for (const [n, salary] of [["low", 1500], ["mid", 15000], ["high", 40000]] as const) {
    await db.employee.create({ data: { companyId, employeeNumber: n, firstName: n, lastName: "Test", hireDate: d("2020-01-01"), contracts: { create: { contractType: "PERMANENT", payType: "MONTHLY", startDate: d("2020-01-01"), baseSalary: SRD(salary), salaryCurrency: "SRD" } } } });
  }
});

afterAll(async () => {
  await db.organization.delete({ where: { id: orgId } });
  await db.$disconnect();
});

describe("statutory schemes of a new company", () => {
  it("follows the statutory pension premium per year (3% + 0.5% per year from 2016, max. 28%)", () => {
    expect([pensionRateBp(2015), pensionRateBp(2016), pensionRateBp(2023), pensionRateBp(2025), pensionRateBp(2026), pensionRateBp(2027), pensionRateBp(2070)]).toEqual([300, 350, 700, 800, 850, 900, 2800]);
  });

  it("pre-configures and approves FVO, pension and the standard health insurance setting", async () => {
    const schemes = await db.contributionScheme.findMany({ where: { companyId }, orderBy: [{ type: "asc" }, { effectiveFrom: "asc" }] });
    const fvo = schemes.filter((s) => s.type === "FVO");
    expect(fvo).toHaveLength(1);
    expect(fvo[0]).toMatchObject({ method: "PERCENTAGE", base: "BASE_SALARY", employeeRateBp: 50, employerRateBp: 50, isActive: true, legalStatus: "VERIFIED", maxBaseMonthly: null });
    expect(fvo[0].approvedAt).not.toBeNull();
    const pension = schemes.filter((s) => s.type === "PENSION");
    expect(pension.map((p) => [p.effectiveFrom.getUTCFullYear(), p.employeeRateBp, p.employerRateBp])).toEqual([[year, pensionRateBp(year) / 2, pensionRateBp(year) / 2], [year + 1, pensionRateBp(year + 1) / 2, pensionRateBp(year + 1) / 2]]);
    for (const p of pension) expect(p).toMatchObject({ base: "REGULAR_WAGE", minBaseMonthly: SRD(2250), maxBaseMonthly: SRD(22500), currency: "SRD", isActive: true, legalStatus: "VERIFIED" });
    const health = schemes.filter((s) => s.type === "HEALTH");
    // Health insurance: ARA Payroll standard setting (not statutory) — 4% of the base salary, 2% + 2%, approved.
    expect(health).toHaveLength(1);
    expect(health[0]).toMatchObject({ method: "PERCENTAGE", base: "BASE_SALARY", employeeRateBp: 200, employerRateBp: 200, isActive: true, legalStatus: "VERIFIED", currency: "SRD" });
    expect(health[0].approvedAt).not.toBeNull();
    for (const s of [...fvo, ...pension, ...health]) expect(schemeIssues(s).map((i) => i.code)).toEqual([]);
    expect(await missingStatutoryContributions(companyId, year, 1)).toEqual([]);
  });

  it("warns when a statutory rate differs from the verified premium", async () => {
    const fvo = await db.contributionScheme.findFirstOrThrow({ where: { companyId, type: "FVO" } });
    expect(schemeIssues({ ...fvo, employeeRateBp: 100 }).map((i) => i.code)).toContain("FVO_RATE_DIFFERS");
    const pension = await db.contributionScheme.findFirstOrThrow({ where: { companyId, type: "PENSION" }, orderBy: { effectiveFrom: "asc" } });
    expect(schemeIssues({ ...pension, employerRateBp: pension.employerRateBp + 50 }).map((i) => i.code)).toContain("PENSION_RATE_DIFFERS");
  });

  it("calculates FVO over the base salary and pension within the minimum and maximum contribution base", async () => {
    const run = await db.payrollRun.create({ data: { companyId, year, month: 1, payDate: d(`${year}-01-25`) } });
    await calculateRun(run.id);
    const slips = await db.payslip.findMany({ where: { runId: run.id }, include: { lines: true } });
    const amt = (num: string, code: string) => slips.find((s) => s.employeeNumber === num)!.lines.find((l) => l.code === code)?.amount;
    const half = pensionRateBp(year) / 2;
    // FVO: 0.5% employee and 0.5% employer of the base salary, no maximum.
    expect([amt("low", "FVO-EE"), amt("low", "FVO-ER")]).toEqual([SRD(7.5), SRD(7.5)]);
    expect([amt("high", "FVO-EE"), amt("high", "FVO-ER")]).toEqual([SRD(200), SRD(200)]);
    // Pension: SRD 1,500 is raised to the minimum base of SRD 2,250; SRD 40,000 is capped at SRD 22,500.
    expect(amt("low", "PENSION-EE")).toBe(Math.round((SRD(2250) * half) / 10000));
    expect(amt("mid", "PENSION-EE")).toBe(Math.round((SRD(15000) * half) / 10000));
    expect(amt("high", "PENSION-EE")).toBe(Math.round((SRD(22500) * half) / 10000));
    expect(amt("high", "PENSION-ER")).toBe(Math.round((SRD(22500) * half) / 10000));
    // Health insurance: 2% employee and 2% employer of the base salary.
    expect([amt("mid", "HEALTH-EE"), amt("mid", "HEALTH-ER")]).toEqual([SRD(300), SRD(300)]);
  });
});
