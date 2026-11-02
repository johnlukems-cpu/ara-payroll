/**
 * Integration tests (real PostgreSQL) for fixed and incidental components: frequencies, overrides,
 * accruals, duplicate prevention and immutability of approved payslips.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { PrismaClient, type Prisma } from "@prisma/client";
import { calculateRun } from "@/lib/payroll/service";
import { DEFAULT_SR_RULES } from "@/lib/payroll/defaults";
import { seedCompanyDefaults } from "@/lib/server/company-setup";
import { assertNoFixedDuplicate, assertNoIncidentalDuplicate, assertPensionNotDouble, resolveComponent } from "@/lib/server/pay-components";
import { UserError } from "@/lib/server/errors";

const db = new PrismaClient();
const SRD = (v: number) => Math.round(v * 100);
const d = (s: string) => new Date(`${s}T00:00:00Z`);
let companyId: string;
let orgId: string;
let employeeId: string;

async function run(month: number) {
  const r = await db.payrollRun.create({ data: { companyId, year: 2026, month, payDate: d(`2026-${String(month).padStart(2, "0")}-25`) } });
  await calculateRun(r.id);
  return r;
}
const slipOf = (runId: string) => db.payslip.findFirstOrThrow({ where: { runId, employeeId }, include: { lines: { orderBy: { sortOrder: "asc" } } } });

beforeAll(async () => {
  const org = await db.organization.create({ data: { name: `IT fixed ${Date.now()}` } });
  orgId = org.id;
  const c = await db.company.create({ data: { name: "Fixed Components Co", organizationId: org.id } });
  companyId = c.id;
  await db.$transaction((tx) => seedCompanyDefaults(tx, c.id));
  await db.taxRuleSet.create({
    data: {
      companyId, name: "IT rules", effectiveFrom: d("2020-01-01"), ...DEFAULT_SR_RULES,
      brackets: DEFAULT_SR_RULES.brackets as unknown as Prisma.InputJsonValue,
      overtimeBrackets: DEFAULT_SR_RULES.overtimeBrackets as unknown as Prisma.InputJsonValue,
    },
  });
  const e = await db.employee.create({
    data: {
      companyId, employeeNumber: "F1", firstName: "Fixed", lastName: "Tester", hireDate: d("2020-01-01"),
      contracts: { create: { contractType: "PERMANENT", payType: "MONTHLY", startDate: d("2020-01-01"), baseSalary: SRD(20_000), salaryCurrency: "SRD", pensionEmployeeBp: 200 } },
    },
  });
  employeeId = e.id;
  const phone = await resolveComponent(companyId, "lib:ALW002", "nl");
  const fuel = await resolveComponent(companyId, "lib:ALW013", "nl");
  const grat = await resolveComponent(companyId, "lib:BON007", "nl");
  const holiday = await resolveComponent(companyId, "lib:BON006", "nl");
  const loan = await resolveComponent(companyId, "lib:DED006", "nl");
  await db.employeePayComponent.createMany({
    data: [
      { employeeId, componentId: phone.id, amount: SRD(300), currency: "SRD", startDate: d("2026-01-01"), label: "Telefoon (zakelijk)" },
      { employeeId, componentId: fuel.id, amount: SRD(500), currency: "SRD", startDate: d("2026-01-01"), taxOverride: "EXEMPT", aovIncluded: false },
      { employeeId, componentId: fuel.id, amount: SRD(999), currency: "SRD", startDate: d("2026-01-01"), label: "Oude brandstof", isActive: false },
      { employeeId, componentId: grat.id, amount: SRD(2_000), currency: "SRD", startDate: d("2026-02-10"), frequency: "ONE_OFF" },
      { employeeId, componentId: holiday.id, calcType: "PERCENT_OF_BASE", rateBp: 800, startDate: d("2026-01-01"), frequency: "ACCRUAL", payMonth: 3 },
      { employeeId, componentId: loan.id, amount: SRD(250), currency: "SRD", startDate: d("2026-01-01"), endDate: d("2026-02-28") },
    ],
  });
});

afterAll(async () => {
  await db.organization.delete({ where: { id: orgId } });
  await db.taxRuleSet.deleteMany({ where: { companyId } });
  await db.$disconnect();
});

describe("fixed components on payslips", () => {
  it("includes active fixed components with their overrides and stores line sources", async () => {
    const r = await run(1);
    const s = await slipOf(r.id);
    const byCode = Object.fromEntries(s.lines.map((l) => [l.code, l]));
    expect(byCode.ALW002.amount).toBe(SRD(300));
    expect((byCode.ALW002.labels as { nl: string }).nl).toBe("Telefoon (zakelijk)");
    expect(byCode.ALW013.amount).toBe(SRD(500)); // the inactive "Oude brandstof" is not included
    expect(s.lines.filter((l) => l.code === "ALW013")).toHaveLength(1);
    expect(byCode.DED006.amount).toBe(SRD(250));
    expect(byCode.BON007).toBeUndefined(); // one-off in February
    expect(byCode.BON006).toBeUndefined(); // accruing
    expect(byCode.SAL001.source).toBe("BASE");
    expect(byCode.ALW002.source).toBe("FIXED");
    expect(byCode.LB.source).toBe("STATUTORY");
    // Fuel allowance explicitly set to tax-exempt: part of gross, not of the taxable/AOV base.
    expect((s.trace as { exemptPaidAllowances: number }).exemptPaidAllowances).toBe(SRD(500));
    expect(s.grossPay).toBe(SRD(20_800));
    expect((s.trace as { accruals: Record<string, { balance: number }> }).accruals).toBeDefined();
    expect(Object.values((s.trace as { accruals: Record<string, { balance: number }> }).accruals)[0].balance).toBe(SRD(1_600));
  });

  it("pays one-off components only in the period of their payment date", async () => {
    const r = await run(2);
    const s = await slipOf(r.id);
    expect(s.lines.find((l) => l.code === "BON007")?.amount).toBe(SRD(2_000));
    expect(s.lines.find((l) => l.code === "DED006")?.amount).toBe(SRD(250)); // loan ends 28 Feb
  });

  it("pays out the accrued holiday allowance in the payment month and resets the balance", async () => {
    const r = await run(3);
    const s = await slipOf(r.id);
    const line = s.lines.find((l) => l.code === "BON006")!;
    expect(line.amount).toBe(SRD(4_800)); // 3 months × 8% of 20,000
    expect(line.source).toBe("FIXED");
    expect(s.lines.find((l) => l.code === "DED006")).toBeUndefined(); // loan ended
    expect(Object.values((s.trace as { accruals: Record<string, { balance: number; paid: number }> }).accruals)[0]).toMatchObject({ paid: SRD(4_800), balance: 0 });
    const r4 = await run(4);
    const s4 = await slipOf(r4.id);
    expect(s4.lines.find((l) => l.code === "BON006")).toBeUndefined();
    expect(Object.values((s4.trace as { accruals: Record<string, { balance: number }> }).accruals)[0].balance).toBe(SRD(1_600));
  });

  it("replaces (never adds to) a fixed amount when it is overridden for one payslip", async () => {
    const r = await db.payrollRun.findFirstOrThrow({ where: { companyId, month: 4 } });
    const phone = await db.employeePayComponent.findFirstOrThrow({ where: { employeeId, label: "Telefoon (zakelijk)" } });
    await db.payrollAdjustment.create({ data: { runId: r.id, employeeId, componentId: phone.componentId, assignmentId: phone.id, amount: SRD(450), currency: "SRD", calcType: "FIXED" } });
    await calculateRun(r.id);
    const lines = (await slipOf(r.id)).lines.filter((l) => l.code === "ALW002");
    expect(lines).toHaveLength(1);
    expect(lines[0].amount).toBe(SRD(450));
  });

  it("adds incidental components with their own source and tax treatment", async () => {
    const r = await db.payrollRun.findFirstOrThrow({ where: { companyId, month: 4 } });
    const bonus = await resolveComponent(companyId, "lib:BON001", "nl");
    await db.payrollAdjustment.create({ data: { runId: r.id, employeeId, componentId: bonus.id, amount: SRD(1_000), currency: "SRD", description: "Prestatiebonus Q1" } });
    await calculateRun(r.id);
    const line = (await slipOf(r.id)).lines.find((l) => l.code === "BON001")!;
    expect(line.source).toBe("INCIDENTAL");
    expect(line.description).toBe("Prestatiebonus Q1");
  });
});

describe("duplicate prevention", () => {
  it("rejects the same fixed component twice for overlapping periods", async () => {
    const phone = await db.payComponent.findFirstOrThrow({ where: { companyId, code: "ALW002" } });
    await expect(assertNoFixedDuplicate({ employeeId, componentId: phone.id, label: "Telefoon (zakelijk)", frequency: "MONTHLY", startDate: d("2026-06-01"), endDate: null })).rejects.toMatchObject({ key: "errors.duplicateFixed" });
    // A different label (e.g. a second, separate phone allowance) is allowed.
    await expect(assertNoFixedDuplicate({ employeeId, componentId: phone.id, label: "Tweede toestel", frequency: "MONTHLY", startDate: d("2026-06-01"), endDate: null })).resolves.toBeUndefined();
    // One-off amounts in different months do not overlap.
    const grat = await db.payComponent.findFirstOrThrow({ where: { companyId, code: "BON007" } });
    await expect(assertNoFixedDuplicate({ employeeId, componentId: grat.id, label: null, frequency: "ONE_OFF", startDate: d("2026-12-10"), endDate: null })).resolves.toBeUndefined();
    await expect(assertNoFixedDuplicate({ employeeId, componentId: grat.id, label: null, frequency: "ONE_OFF", startDate: d("2026-02-01"), endDate: null })).rejects.toBeInstanceOf(UserError);
  });

  it("rejects an incidental entry of a component that already applies as fixed, unless confirmed", async () => {
    const r = await db.payrollRun.findFirstOrThrow({ where: { companyId, month: 4 } });
    const loanRun = await db.payrollRun.findFirstOrThrow({ where: { companyId, month: 2 } });
    const fuel = await db.payComponent.findFirstOrThrow({ where: { companyId, code: "ALW013" } });
    const loan = await db.payComponent.findFirstOrThrow({ where: { companyId, code: "DED006" } });
    await expect(assertNoIncidentalDuplicate(r, employeeId, fuel, null, false)).rejects.toMatchObject({ key: "errors.duplicateOfFixed" });
    await expect(assertNoIncidentalDuplicate(r, employeeId, fuel, null, true)).resolves.toBeUndefined();
    await expect(assertNoIncidentalDuplicate(loanRun, employeeId, loan, null, false)).rejects.toMatchObject({ key: "errors.duplicateOfFixed" });
    await expect(assertNoIncidentalDuplicate(r, employeeId, loan, null, false)).resolves.toBeUndefined(); // loan ended in February
    const bonus = await db.payComponent.findFirstOrThrow({ where: { companyId, code: "BON001" } });
    await expect(assertNoIncidentalDuplicate(r, employeeId, bonus, "Prestatiebonus Q1", false)).rejects.toMatchObject({ key: "errors.duplicateIncidental" });
  });

  it("never offers statutory deductions and blocks a fixed pension amount next to the contract percentage", async () => {
    await expect(resolveComponent(companyId, "lib:DED001", "nl")).rejects.toMatchObject({ key: "errors.statutoryAutomatic" });
    await expect(resolveComponent(companyId, "lib:DED011", "nl")).rejects.toMatchObject({ key: "errors.statutoryAutomatic" });
    const pension = await resolveComponent(companyId, "lib:DED013", "nl");
    await expect(assertPensionNotDouble(employeeId, pension)).rejects.toMatchObject({ key: "errors.pensionViaContract" });
    // Selecting a library entry twice reuses the adopted component instead of creating a duplicate.
    const again = await resolveComponent(companyId, "lib:DED013", "nl");
    expect(again.id).toBe(pension.id);
  });
});

describe("historical payslips", () => {
  it("are not changed by later changes to fixed components", async () => {
    const r = await db.payrollRun.findFirstOrThrow({ where: { companyId, month: 1 } });
    await db.payrollRun.update({ where: { id: r.id }, data: { status: "APPROVED" } });
    const before = await slipOf(r.id);
    await db.employeePayComponent.updateMany({ where: { employeeId, label: "Telefoon (zakelijk)" }, data: { amount: SRD(800) } });
    await expect(calculateRun(r.id)).rejects.toMatchObject({ key: "errors.runLocked" });
    const after = await slipOf(r.id);
    expect(after.netPay).toBe(before.netPay);
    expect(after.lines.map((l) => [l.code, l.amount])).toEqual(before.lines.map((l) => [l.code, l.amount]));
  });
});
