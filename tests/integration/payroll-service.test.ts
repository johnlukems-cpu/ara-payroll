/**
 * Integration tests against a real PostgreSQL database (DATABASE_URL).
 * Run with: npm run test:integration
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { PrismaClient, type Prisma } from "@prisma/client";
import { calculateRun, PayrollError } from "@/lib/payroll/service";
import { DEFAULT_SR_RULES } from "@/lib/payroll/defaults";
import { seedCompanyDefaults } from "@/lib/server/company-setup";

const db = new PrismaClient();
const SRD = (v: number) => Math.round(v * 100);
let companyId: string;
let orgId: string;

beforeAll(async () => {
  const org = await db.organization.create({ data: { name: `IT ${Date.now()}` } });
  orgId = org.id;
  const c = await db.company.create({ data: { name: "Integration Co", organizationId: org.id } });
  companyId = c.id;
  await db.$transaction((tx) => seedCompanyDefaults(tx, c.id));
  await db.taxRuleSet.create({
    data: {
      companyId, name: "IT rules", effectiveFrom: new Date("2020-01-01"), ...DEFAULT_SR_RULES,
      brackets: DEFAULT_SR_RULES.brackets as unknown as Prisma.InputJsonValue,
      overtimeBrackets: DEFAULT_SR_RULES.overtimeBrackets as unknown as Prisma.InputJsonValue,
    },
  });
  const kb = await db.payComponent.findFirstOrThrow({ where: { companyId, code: "KB" } });
  await db.employee.create({
    data: {
      companyId, employeeNumber: "1", firstName: "Full", lastName: "Month", hireDate: new Date("2020-01-01"), numberOfChildren: 2,
      contracts: { create: { contractType: "PERMANENT", payType: "MONTHLY", startDate: new Date("2020-01-01"), baseSalary: SRD(30_000) } },
      components: { create: { componentId: kb.id, amount: SRD(250), startDate: new Date("2020-01-01") } },
    },
  });
  await db.employee.create({
    data: {
      companyId, employeeNumber: "2", firstName: "Mid", lastName: "Hire", hireDate: new Date("2026-04-16"),
      contracts: { create: { contractType: "PERMANENT", payType: "MONTHLY", startDate: new Date("2026-04-16"), baseSalary: SRD(15_000) } },
    },
  });
  await db.employee.create({ data: { companyId, employeeNumber: "3", firstName: "No", lastName: "Contract", hireDate: new Date("2020-01-01") } });
  await db.employee.create({
    data: {
      companyId, employeeNumber: "4", firstName: "Gone", lastName: "Before", hireDate: new Date("2020-01-01"), terminationDate: new Date("2026-02-28"), status: "TERMINATED",
      contracts: { create: { contractType: "PERMANENT", payType: "MONTHLY", startDate: new Date("2020-01-01"), baseSalary: SRD(10_000) } },
    },
  });
});

afterAll(async () => {
  await db.organization.delete({ where: { id: orgId } });
  await db.taxRuleSet.deleteMany({ where: { companyId } });
  await db.$disconnect();
});

describe("calculateRun", () => {
  it("creates payslips for eligible employees with prorating and totals", async () => {
    const run = await db.payrollRun.create({ data: { companyId, year: 2026, month: 4, payDate: new Date("2026-04-25") } });
    const res = await calculateRun(run.id);
    expect(res.count).toBe(2);
    expect(res.skipped.map((s) => s.name)).toEqual(["No Contract"]);

    const slips = await db.payslip.findMany({ where: { runId: run.id }, orderBy: { employeeNumber: "asc" } });
    expect(slips[0].grossPay).toBe(SRD(30_250));
    expect(slips[1].grossPay).toBe(SRD(7_500)); // 15 of 30 days
    const updated = await db.payrollRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(updated.status).toBe("CALCULATED");
    expect(updated.totalNet).toBe(slips.reduce((s, p) => s + p.netPay, 0));
    for (const s of slips) expect(s.netPay).toBe(s.grossPay - s.totalDeductions);
  });

  it("is idempotent on recalculation", async () => {
    const run = await db.payrollRun.findFirstOrThrow({ where: { companyId, month: 4 } });
    const before = await db.payslip.findMany({ where: { runId: run.id }, select: { netPay: true }, orderBy: { employeeNumber: "asc" } });
    await calculateRun(run.id);
    const after = await db.payslip.findMany({ where: { runId: run.id }, select: { netPay: true }, orderBy: { employeeNumber: "asc" } });
    expect(after).toEqual(before);
  });

  it("refuses to recalculate approved runs", async () => {
    const run = await db.payrollRun.findFirstOrThrow({ where: { companyId, month: 4 } });
    await db.payrollRun.update({ where: { id: run.id }, data: { status: "APPROVED" } });
    await expect(calculateRun(run.id)).rejects.toBeInstanceOf(PayrollError);
  });

  it("tracks the bonus exemption across the year", async () => {
    const emp = await db.employee.findFirstOrThrow({ where: { companyId, employeeNumber: "1" } });
    const may = await db.payrollRun.create({ data: { companyId, year: 2026, month: 5, payDate: new Date("2026-05-25") } });
    await db.payrollInput.create({ data: { runId: may.id, employeeId: emp.id, bonus: SRD(8_000) } });
    await calculateRun(may.id);
    const jun = await db.payrollRun.create({ data: { companyId, year: 2026, month: 6, payDate: new Date("2026-06-25") } });
    await db.payrollInput.create({ data: { runId: jun.id, employeeId: emp.id, bonus: SRD(8_000) } });
    await calculateRun(jun.id);
    const slip = await db.payslip.findFirstOrThrow({ where: { runId: jun.id, employeeId: emp.id } });
    const trace = slip.trace as Record<string, number>;
    expect(trace.bonusExemptUsed).toBe(SRD(2_016));
    expect(trace.bonusTax).toBe(Math.round(SRD(5_984) * 0.38));
  });
});

describe("calculateRun — multicurrency", () => {
  let runId: string;
  let usdEmpId: string;

  beforeAll(async () => {
    const trans = await db.payComponent.findFirstOrThrow({ where: { companyId, code: "ALW001" } });
    const usd = await db.employee.create({
      data: {
        companyId, employeeNumber: "10", firstName: "Dollar", lastName: "Earner", hireDate: new Date("2020-01-01"), paymentCurrency: "USD",
        contracts: { create: { contractType: "PERMANENT", payType: "MONTHLY", salaryCurrency: "USD", startDate: new Date("2020-01-01"), baseSalary: SRD(1_000) } },
        components: { create: { componentId: trans.id, amount: SRD(600), currency: "SRD", startDate: new Date("2020-01-01") } },
      },
    });
    usdEmpId = usd.id;
    const run = await db.payrollRun.create({ data: { companyId, year: 2026, month: 9, payDate: new Date("2026-09-25") } });
    runId = run.id;
  });

  it("refuses to calculate without an approved rate (pending rates are ignored)", async () => {
    await db.exchangeRate.create({ data: { companyId, baseCurrency: "USD", quoteCurrency: "SRD", rate: "36", effectiveDate: new Date("2026-01-01"), status: "PENDING" } });
    await expect(calculateRun(runId)).rejects.toMatchObject({ key: "errors.missingRates" });
  });

  it("converts salary into the statutory currency and net pay into the payment currency, recording every conversion", async () => {
    await db.exchangeRate.create({ data: { companyId, baseCurrency: "USD", quoteCurrency: "SRD", rate: "36.5", effectiveDate: new Date("2026-08-01"), status: "APPROVED" } });
    // A later rate (after the period end) must not be used.
    await db.exchangeRate.create({ data: { companyId, baseCurrency: "USD", quoteCurrency: "SRD", rate: "40", effectiveDate: new Date("2026-10-01"), status: "APPROVED" } });
    await calculateRun(runId);
    const slip = await db.payslip.findFirstOrThrow({ where: { runId, employeeId: usdEmpId }, include: { lines: true } });
    expect(slip.calcCurrency).toBe("SRD");
    expect(slip.salaryCurrency).toBe("USD");
    expect(slip.grossPay).toBe(SRD(36_500 + 600)); // USD 1,000 @ 36.5 + SRD 600 (not reinterpreted as USD)
    expect(slip.netPayPayment).toBe(Math.round(slip.netPay / 36.5));
    const conv = slip.conversions as unknown as { purpose: string; rate: string; rateDate: string }[];
    expect(conv.find((c) => c.purpose === "BASE")).toMatchObject({ rate: "36.5", rateDate: "2026-08-01" });
    expect(conv.find((c) => c.purpose === "NET_PAY")?.rate).toBe("0.0273972603");
    expect(slip.lines.find((l) => l.code === "SAL001")).toMatchObject({ originalAmount: SRD(1_000), originalCurrency: "USD" });
  });

  it("keeps run totals in the base currency and never adds currencies together", async () => {
    const run = await db.payrollRun.findUniqueOrThrow({ where: { id: runId } });
    const slips = await db.payslip.findMany({ where: { runId } });
    expect(run.currency).toBe("SRD");
    expect(run.totalNet).toBe(slips.reduce((s, p) => s + p.netBase, 0));
  });
});
