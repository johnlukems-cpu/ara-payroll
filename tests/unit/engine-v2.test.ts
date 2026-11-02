/**
 * Engine tests for the component library, S.B. 2024 no. 2 tax structure, AOV rules and leave.
 * S.B. 2024 no. 2 figures are taken from the decree as supplied by ARA Intelligent Solutions; they are
 * technical checks of the calculation method, not a statement that these rules apply in 2026.
 */
import { describe, expect, it } from "vitest";
import { calculatePayslip, resolveComponentAmounts, ageOn, type ComponentInput, type EmployeeInput, type PeriodInput, type AovRules } from "@/lib/payroll/engine";
import { SB_2024_2, SB_2024_2_ART17A, AOV_RESEARCH, DEFAULT_SR_RULES } from "@/lib/payroll/defaults";
import { evaluateFormula, FormulaError } from "@/lib/payroll/formula";
import { COMPONENT_LIBRARY } from "@/lib/payroll/library";

const SRD = (v: number) => Math.round(v * 100);
const rules = SB_2024_2.rules;
const aov = AOV_RESEARCH.rules;
const emp = (o: Partial<EmployeeInput> = {}): EmployeeInput => ({ payType: "MONTHLY", baseSalary: SRD(15_000), hourlyRate: 0, hoursPerWeek: 40, pensionEmployeeBp: 0, pensionEmployerBp: 0, numberOfChildren: 0, employedFraction: 1, age: 35, ...o });
const period = (o: Partial<PeriodInput> = {}): PeriodInput => ({ hoursWorked: null, overtime1Hours: 0, overtime2Hours: 0, overtime1RateBp: 15000, overtime2RateBp: 20000, bonus: 0, unpaidDays: 0, ytdBonusExemptUsed: 0, ...o });
const comp = (o: Partial<ComponentInput>): ComponentInput => ({ code: "X", name: "X", kind: "ALLOWANCE", calcType: "FIXED", taxTreatment: "TAXABLE", exemptLimit: 0, preTax: false, amount: 0, rateBp: 0, ...o });

describe("S.B. 2024 no. 2 — standard regime (art. 12, 13, 14)", () => {
  it("applies art. 12 deduction, art. 13 tax-free amount and art. 14 progressive brackets", () => {
    const r = calculatePayslip(emp(), period(), [], rules, aov);
    expect(r.trace.lumpSum).toBe(SRD(400)); // art. 12: SRD 4,800/yr = SRD 400/month
    expect(r.trace.annualZuiverLoon).toBe(SRD(175_200));
    expect(r.trace.annualTaxable).toBe(SRD(67_200)); // − art. 13 SRD 108,000 (annual only, not also the monthly amount)
    // art. 14: 42,000 × 8% = 3,360 + 25,200 × 18% = 4,536 → 7,896 / 12 = 658
    expect(r.trace.annualTax).toBe(SRD(7_896));
    expect(r.wageTax).toBe(SRD(658));
    expect(r.trace.taxCredit).toBe(0);
    expect((r.trace.brackets as { rateBp: number; taxable: number }[]).map((b) => [b.rateBp, b.taxable])).toEqual([[800, SRD(42_000)], [1800, SRD(25_200)]]);
  });

  it("is progressive across all four brackets", () => {
    // monthly 20,400 → zuiver 20,000 → 240,000 − 108,000 = 132,000 taxable
    const r = calculatePayslip(emp({ baseSalary: SRD(20_400) }), period(), [], rules, aov);
    expect(r.trace.annualTaxable).toBe(SRD(132_000));
    // 3,360 + 7,560 + 11,760 + 6,000 × 38% (2,280) = 24,960
    expect(r.trace.annualTax).toBe(SRD(24_960));
    expect(r.wageTax).toBe(SRD(2_080));
  });

  it("pays no wage tax up to the tax-free amount", () => {
    const r = calculatePayslip(emp({ baseSalary: SRD(9_400) }), period(), [], rules, aov);
    expect(r.trace.annualTaxable).toBe(0);
    expect(r.wageTax).toBe(0);
  });

  it("monthly-table method uses only the monthly equivalents and gives the same result", () => {
    const annual = calculatePayslip(emp({ baseSalary: SRD(20_400) }), period(), [], rules, aov);
    const monthly = calculatePayslip(emp({ baseSalary: SRD(20_400) }), period(), [], { ...rules, calcMethod: "MONTHLY_TABLE" }, aov);
    expect(monthly.trace.taxFree).toBe(SRD(9_000));
    expect(monthly.wageTax).toBe(annual.wageTax);
  });

  it("keeps the art. 17a structure separate from art. 14", () => {
    const std = calculatePayslip(emp({ baseSalary: SRD(20_400) }), period(), [], rules, aov);
    const a17 = calculatePayslip(emp({ baseSalary: SRD(20_400) }), period(), [], SB_2024_2_ART17A.rules, aov);
    // 2,100 + 6,300 + 10,500 + 6,000 × 35% (2,100) = 21,000
    expect(a17.trace.annualTax).toBe(SRD(21_000));
    expect(a17.wageTax).not.toBe(std.wageTax);
  });
});

describe("AOV rules", () => {
  it("charges 4% of zuiver loon to the employee, separate from wage tax", () => {
    const r = calculatePayslip(emp(), period(), [], rules, aov);
    expect(r.aovBase).toBe(SRD(14_600));
    expect(r.aov).toBe(SRD(584));
    expect(r.aovEmployer).toBe(0);
    expect(r.lines.find((l) => l.code === "AOV")?.amount).toBe(SRD(584));
  });
  it("exempts employees from the configured age", () => {
    const r = calculatePayslip(emp({ age: 60 }), period(), [], rules, aov);
    expect(r.aov).toBe(0);
    expect((r.trace.aov as { exempt: boolean }).exempt).toBe(true);
  });
  it("splits employer and employee shares; the employer share never reduces net pay", () => {
    const split: AovRules = { ...aov, employeeShareBp: 5000 };
    const r = calculatePayslip(emp(), period(), [], rules, split);
    expect(r.aov + r.aovEmployer).toBe(SRD(584));
    expect(r.netPay).toBe(r.grossPay - r.totalDeductions);
    expect(r.employerCost).toBe(r.grossPay + r.aovEmployer);
  });
  it("applies franchise, minimum and maximum", () => {
    expect(calculatePayslip(emp(), period(), [], rules, { ...aov, franchiseMonthly: SRD(600) }).aov).toBe(SRD(560));
    expect(calculatePayslip(emp(), period(), [], rules, { ...aov, maxMonthly: SRD(500) }).aov).toBe(SRD(500));
    expect(calculatePayslip(emp({ baseSalary: SRD(1_000) }), period(), [], rules, { ...aov, minMonthly: SRD(100) }).aov).toBe(SRD(100));
  });
  it("supports a gross-wage base with per-component inclusion", () => {
    const tr = comp({ code: "ALW001", amount: SRD(1_000), aovIncluded: false });
    const r = calculatePayslip(emp(), period(), [tr], rules, { ...aov, base: "GROSS_WAGE" });
    expect(r.aovBase).toBe(SRD(15_000));
  });
});

describe("calculation methods", () => {
  const ctx = { base: SRD(10_000), hourly: SRD(50), daily: SRD(400) };
  it("resolves every method", () => {
    const a = resolveComponentAmounts([
      comp({ code: "F", amount: SRD(100) }),
      comp({ code: "P", calcType: "PERCENT_OF_BASE", rateBp: 1000 }),
      comp({ code: "PC", calcType: "PERCENT_OF_COMPONENT", baseComponentCode: "P", rateBp: 5000 }),
      comp({ code: "H", calcType: "HOURS_X_RATE", quantity: 10, multiplierBp: 25000 }),
      comp({ code: "D", calcType: "DAYS_X_RATE", quantity: 2 }),
      comp({ code: "Q", calcType: "QTY_X_PRICE", quantity: 3, unitPrice: SRD(25) }),
      comp({ code: "FX", calcType: "FORMULA", formula: "MIN(BASE * 0.05, 300) + F" }),
      comp({ code: "M", calcType: "MANUAL", amount: SRD(42) }),
    ], ctx);
    expect(a).toEqual([SRD(100), SRD(1_000), SRD(500), SRD(1_250), SRD(800), SRD(75), SRD(400), SRD(42)]);
  });
  it("rejects circular references", () => {
    expect(() => resolveComponentAmounts([
      comp({ code: "A", calcType: "PERCENT_OF_COMPONENT", baseComponentCode: "B", rateBp: 100 }),
      comp({ code: "B", calcType: "PERCENT_OF_COMPONENT", baseComponentCode: "A", rateBp: 100 }),
    ], ctx)).toThrow(/Circular/);
  });
});

describe("formula evaluator", () => {
  it("evaluates safely", () => {
    expect(evaluateFormula("(BASE + 100) * 2 / 4", { BASE: 100 })).toBe(100);
    expect(evaluateFormula("-MAX(1, 2, 3) + ROUND(1.236)", {})).toBe(-1.76);
  });
  it("rejects anything that is not arithmetic", () => {
    for (const bad of ["process.exit()", "BASE; 1", "1 / 0", "UNKNOWN + 1", "constructor", "1 +"]) expect(() => evaluateFormula(bad, { BASE: 1 })).toThrow(FormulaError);
  });
});

describe("component treatments", () => {
  it("never deducts employer contributions from net pay", () => {
    const er = comp({ code: "ER002", kind: "EMPLOYER", amount: SRD(500) });
    const without = calculatePayslip(emp(), period(), [], rules, aov);
    const withEr = calculatePayslip(emp(), period(), [er], rules, aov);
    expect(withEr.netPay).toBe(without.netPay);
    expect(withEr.employerCost).toBe(without.employerCost + SRD(500));
    expect(withEr.lines.find((l) => l.code === "ER002")?.type).toBe("EMPLOYER");
  });
  it("taxes bonus components as special rewards with the annual exemption", () => {
    const b = comp({ code: "BON006", amount: SRD(12_000), taxTreatment: "SPECIAL_REWARD" });
    const r = calculatePayslip(emp(), period({ ytdBonusExemptUsed: 0 }), [b], rules, aov);
    expect(r.bonusExemptUsed).toBe(rules.bonusExemptAnnual);
    expect(r.bonusTax).toBeGreaterThan(0);
    expect(r.grossPay).toBe(SRD(27_000));
  });
  it("taxes overtime components under the overtime brackets", () => {
    const o = comp({ code: "OVT003", calcType: "HOURS_X_RATE", quantity: 4, multiplierBp: 25000, taxTreatment: "OVERTIME" });
    const r = calculatePayslip(emp(), period(), [o], rules, aov);
    expect(r.overtimeTax).toBeGreaterThan(0);
    expect(r.wageTax).toBe(SRD(658)); // regular wage tax unaffected
  });
  it("treats benefits in kind as taxable gross but not paid out", () => {
    const bik = comp({ code: "ALW005", amount: SRD(1_000), netEffect: "NONE" });
    const r = calculatePayslip(emp(), period(), [bik], rules, aov);
    expect(r.netPay).toBe(r.grossPay - r.totalDeductions - SRD(1_000));
  });
  it("includes components in the pension base only when configured", () => {
    const a = comp({ code: "ALW008", amount: SRD(1_000), pensionIncluded: true });
    const r = calculatePayslip(emp({ pensionEmployeeBp: 500 }), period(), [a], rules, aov);
    expect(r.pensionEmployee).toBe(SRD(800));
  });
});

describe("pay types", () => {
  it("calculates weekly and daily pay", () => {
    expect(calculatePayslip(emp({ payType: "WEEKLY", baseSalary: SRD(3_000) }), period(), [], rules, aov).trace.basePay).toBe(SRD(13_000));
    expect(calculatePayslip(emp({ payType: "DAILY", baseSalary: SRD(500) }), period({ daysWorked: 20 }), [], rules, aov).trace.basePay).toBe(SRD(10_000));
  });
});

describe("leave in payroll", () => {
  it("reduces pay only by the unpaid share of approved leave and shows a separate line", () => {
    const r = calculatePayslip(emp({ baseSalary: SRD(21_750) }), period({ leave: [{ code: "LEV006", label: "Ouderschapsverlof", days: 5, payPercentBp: 6000 }] }), [], rules, aov);
    // daily 1,000 × 5 days × 40% unpaid = 2,000
    expect(r.trace.basePay).toBe(SRD(19_750));
    expect(r.lines.find((l) => l.code === "LEV006")).toMatchObject({ amount: -SRD(2_000), quantity: 5 });
  });
  it("does not reduce salary for fully paid parental leave but keeps it traceable", () => {
    const r = calculatePayslip(emp(), period({ leave: [{ code: "LEV007", label: "Zwangerschapsverlof", days: 10, payPercentBp: 10000, informational: true }] }), [], rules, aov);
    expect(r.trace.basePay).toBe(SRD(15_000));
    expect(r.lines.find((l) => l.code === "LEV007")?.amount).toBe(-0);
  });
});

describe("component library", () => {
  it("contains every requested category and code with Dutch and English names", () => {
    const codes = COMPONENT_LIBRARY.map((c) => c.code);
    const expected = [
      ...Array.from({ length: 8 }, (_, i) => `SAL00${i + 1}`), ...Array.from({ length: 12 }, (_, i) => `ALW${String(i + 1).padStart(3, "0")}`),
      ...Array.from({ length: 8 }, (_, i) => `OVT00${i + 1}`), ...Array.from({ length: 10 }, (_, i) => `BON${String(i + 1).padStart(3, "0")}`),
      ...Array.from({ length: 10 }, (_, i) => `DED${String(i + 1).padStart(3, "0")}`), ...Array.from({ length: 5 }, (_, i) => `ER00${i + 1}`),
      ...Array.from({ length: 10 }, (_, i) => `LEV${String(i + 1).padStart(3, "0")}`),
    ];
    for (const c of expected) expect(codes).toContain(c);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of COMPONENT_LIBRARY) {
      expect(c.nameNl.length).toBeGreaterThan(2);
      expect(c.nameEn.length).toBeGreaterThan(2);
    }
    expect(new Set(COMPONENT_LIBRARY.map((c) => c.category))).toEqual(new Set(["SALARY", "ALLOWANCE", "OVERTIME", "BONUS", "DEDUCTION", "EMPLOYER", "LEAVE"]));
    expect(COMPONENT_LIBRARY.filter((c) => c.category === "EMPLOYER").every((c) => c.netEffect === "NONE")).toBe(true);
  });
});

describe("helpers", () => {
  it("computes age", () => {
    expect(ageOn(new Date("1966-11-30"), new Date("2026-11-30"))).toBe(60);
    expect(ageOn(new Date("1966-12-01"), new Date("2026-11-30"))).toBe(59);
    expect(ageOn(null, new Date())).toBeNull();
  });
  it("legacy rule sets still behave as before", () => {
    expect(calculatePayslip(emp(), period(), [], DEFAULT_SR_RULES).aov).toBe(SRD(584));
  });
});
