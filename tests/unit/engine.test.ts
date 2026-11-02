import { describe, expect, it } from "vitest";
import {
  calculatePayslip,
  employedFraction,
  progressiveTax,
  validateBrackets,
  type ComponentInput,
  type EmployeeInput,
  type PeriodInput,
  type TaxRules,
} from "@/lib/payroll/engine";
import { DEFAULT_SR_RULES } from "@/lib/payroll/defaults";

const SRD = (v: number) => Math.round(v * 100);

const rules: TaxRules = DEFAULT_SR_RULES;

const emp = (o: Partial<EmployeeInput> = {}): EmployeeInput => ({
  payType: "MONTHLY",
  baseSalary: SRD(15_000),
  hourlyRate: 0,
  hoursPerWeek: 40,
  pensionEmployeeBp: 0,
  pensionEmployerBp: 0,
  numberOfChildren: 0,
  employedFraction: 1,
  ...o,
});

const period = (o: Partial<PeriodInput> = {}): PeriodInput => ({
  hoursWorked: null,
  overtime1Hours: 0,
  overtime2Hours: 0,
  overtime1RateBp: 15000,
  overtime2RateBp: 20000,
  bonus: 0,
  unpaidDays: 0,
  ytdBonusExemptUsed: 0,
  ...o,
});

const comp = (o: Partial<ComponentInput>): ComponentInput => ({
  code: "X",
  name: "X",
  kind: "ALLOWANCE",
  calcType: "FIXED",
  taxTreatment: "TAXABLE",
  exemptLimit: 0,
  preTax: false,
  amount: 0,
  rateBp: 0,
  ...o,
});

describe("progressiveTax", () => {
  const b = [
    { upTo: 1000, rateBp: 0 },
    { upTo: 2000, rateBp: 1000 },
    { upTo: null, rateBp: 2000 },
  ];
  it("returns 0 for non-positive amounts", () => {
    expect(progressiveTax(0, b)).toBe(0);
    expect(progressiveTax(-50, b)).toBe(0);
  });
  it("applies brackets cumulatively", () => {
    expect(progressiveTax(1000, b)).toBe(0);
    expect(progressiveTax(1500, b)).toBe(50);
    expect(progressiveTax(3000, b)).toBe(100 + 200);
  });
});

describe("validateBrackets", () => {
  it("accepts the default tables", () => {
    expect(validateBrackets(rules.brackets)).toBeNull();
    expect(validateBrackets(rules.overtimeBrackets)).toBeNull();
  });
  it("rejects non-increasing or closed tables", () => {
    expect(validateBrackets([{ upTo: 100, rateBp: 0 }, { upTo: 50, rateBp: 1 }, { upTo: null, rateBp: 2 }])).toEqual({ code: "increase", row: 2 });
    expect(validateBrackets([{ upTo: 100, rateBp: 0 }])).toEqual({ code: "lastOpen" });
    expect(validateBrackets([{ upTo: null, rateBp: 20000 }])).toEqual({ code: "rate", row: 1 });
  });
});

describe("calculatePayslip", () => {
  it("pays no wage tax below the tax-free threshold but still deducts AOV", () => {
    const r = calculatePayslip(emp({ baseSalary: SRD(8_000) }), period(), [], rules);
    expect(r.wageTax).toBe(0);
    // AOV: 4% of (8000 - 400)
    expect(r.aov).toBe(SRD(304));
    expect(r.netPay).toBe(SRD(8_000 - 304));
  });

  it("calculates wage tax with lump-sum deduction and tax credit", () => {
    const r = calculatePayslip(emp({ baseSalary: SRD(15_000) }), period(), [], rules);
    // forfait: min(4% of 15000 = 600, 4800/12 = 400) = 400
    expect(r.trace.lumpSum).toBe(SRD(400));
    // annual taxable 14600 * 12 = 175,200
    expect(r.trace.annualTaxable).toBe(SRD(175_200));
    // tax: (150000-108000)*8% = 3360 + (175200-150000)*18% = 4536 → 7896/yr → 658/mo − 750 credit → 0
    expect(r.trace.annualTax).toBe(SRD(7_896));
    expect(r.wageTax).toBe(0);
  });

  it("calculates wage tax for a higher salary", () => {
    const r = calculatePayslip(emp({ baseSalary: SRD(30_000) }), period(), [], rules);
    // monthly taxable 29600 → annual 355,200
    // 3360 + 7560 + 11760 + (355200-234000)*38% = 46056 → total 68,736 → 5728/mo − 750 = 4978
    expect(r.trace.annualTax).toBe(SRD(68_736));
    expect(r.wageTax).toBe(SRD(4_978));
    expect(r.aov).toBe(SRD(1_184));
    expect(r.netPay).toBe(SRD(30_000 - 4_978 - 1_184));
  });

  it("reduces taxable wage by pre-tax pension and reports employer pension", () => {
    const r = calculatePayslip(emp({ baseSalary: SRD(30_000), pensionEmployeeBp: 500, pensionEmployerBp: 700 }), period(), [], rules);
    expect(r.pensionEmployee).toBe(SRD(1_500));
    expect(r.pensionEmployer).toBe(SRD(2_100));
    expect(r.trace.regularTaxable).toBe(SRD(28_500));
    expect(r.employerCost).toBe(SRD(32_100));
  });

  it("taxes overtime separately under overtime brackets", () => {
    // hourly rate = 15000 / (40 * 52/12) = 86.538...
    const r = calculatePayslip(emp(), period({ overtime1Hours: 10 }), [], rules);
    const expectedOt = Math.round(10 * (SRD(15_000) / (40 * 52 / 12)) * 1.5);
    expect(r.trace.overtimePay).toBe(expectedOt);
    expect(r.overtimeTax).toBe(Math.round(expectedOt * 0.05));
    expect(r.grossPay).toBe(SRD(15_000) + expectedOt);
  });

  it("caps tax-free child allowance per child and taxes the excess", () => {
    const c = comp({ code: "KB", name: "Kinderbijslag", taxTreatment: "CHILD_ALLOWANCE", amount: SRD(1_000) });
    const r = calculatePayslip(emp({ numberOfChildren: 6 }), period(), [c], rules);
    expect(r.trace.exemptAllowances).toBe(SRD(500)); // 4 children max × 125
    expect(r.trace.taxableAllowances).toBe(SRD(500));
  });

  it("supports percentage allowances and post-tax deductions", () => {
    const a = comp({ code: "TRANS", calcType: "PERCENT_OF_BASE", rateBp: 1000 });
    const d = comp({ code: "LOAN", kind: "DEDUCTION", amount: SRD(250) });
    const r = calculatePayslip(emp(), period(), [a, d], rules);
    expect(r.grossPay).toBe(SRD(16_500));
    expect(r.totalDeductions).toBe(r.totalTax + r.aov + SRD(250));
    expect(r.netPay).toBe(r.grossPay - r.totalDeductions);
  });

  it("exempts bonus up to the remaining annual exemption", () => {
    const first = calculatePayslip(emp({ baseSalary: SRD(30_000) }), period({ bonus: SRD(8_000) }), [], rules);
    expect(first.bonusExemptUsed).toBe(SRD(8_000));
    expect(first.bonusTax).toBe(0);
    const second = calculatePayslip(emp({ baseSalary: SRD(30_000) }), period({ bonus: SRD(8_000), ytdBonusExemptUsed: SRD(8_000) }), [], rules);
    expect(second.bonusExemptUsed).toBe(SRD(2_016));
    // taxable 5984 at top 38% bracket
    expect(second.bonusTax).toBe(Math.round(SRD(5_984) * 0.38));
  });

  it("deducts unpaid days and prorates partial months", () => {
    const unpaid = calculatePayslip(emp({ baseSalary: SRD(21_750) }), period({ unpaidDays: 2 }), [], rules);
    expect(unpaid.trace.basePay).toBe(SRD(19_750));
    const partial = calculatePayslip(emp({ baseSalary: SRD(15_000), employedFraction: 0.5 }), period(), [], rules);
    expect(partial.trace.basePay).toBe(SRD(7_500));
  });

  it("calculates hourly employees", () => {
    const r = calculatePayslip(emp({ payType: "HOURLY", hourlyRate: SRD(50), baseSalary: 0 }), period({ hoursWorked: 160 }), [], rules);
    expect(r.trace.basePay).toBe(SRD(8_000));
  });

  it("always balances: gross − deductions = net", () => {
    for (const salary of [0, 1_000, 9_999, 50_000, 250_000]) {
      const r = calculatePayslip(emp({ baseSalary: SRD(salary), pensionEmployeeBp: 300 }), period({ overtime2Hours: 5, bonus: SRD(20_000) }), [], rules);
      expect(r.netPay).toBe(r.grossPay - r.totalDeductions);
      expect(r.wageTax).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("employedFraction", () => {
  it("is 1 for a full month", () => {
    expect(employedFraction(2026, 3, new Date("2020-01-01"), null)).toBe(1);
  });
  it("prorates hires and terminations", () => {
    expect(employedFraction(2026, 4, new Date("2026-04-16"), null)).toBe(15 / 30);
    expect(employedFraction(2026, 4, new Date("2020-01-01"), new Date("2026-04-10"))).toBe(10 / 30);
    expect(employedFraction(2026, 4, new Date("2026-05-01"), null)).toBe(0);
  });
});

import { workingDaysBetween } from "@/lib/leave";
describe("workingDaysBetween", () => {
  it("excludes weekends and fixed Surinamese holidays", () => {
    // Mon 2026-06-29 → Fri 2026-07-03, with Keti Koti (Wed 1 July)
    expect(workingDaysBetween(new Date("2026-06-29"), new Date("2026-07-03"))).toBe(4);
    expect(workingDaysBetween(new Date("2026-07-04"), new Date("2026-07-05"))).toBe(0);
    expect(workingDaysBetween(new Date("2026-07-05"), new Date("2026-07-04"))).toBe(0);
  });
});
