/**
 * Fixed and incidental components: frequency schedule, accruals (holiday allowance), line sources and
 * the payslip summary (12 totals).
 */
import { describe, expect, it } from "vitest";
import { calculatePayslip, type ComponentInput, type EmployeeInput, type PeriodInput } from "@/lib/payroll/engine";
import { SB_2024_2, AOV_RESEARCH } from "@/lib/payroll/defaults";
import { priorAccrual, scheduleFor, type ScheduledAssignment } from "@/lib/payroll/schedule";
import { lineSource, payslipSummary, SUMMARY_ROWS } from "@/lib/payroll/summary";

const SRD = (v: number) => Math.round(v * 100);
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const a = (o: Partial<ScheduledAssignment>): ScheduledAssignment => ({ frequency: "MONTHLY", startDate: d("2026-01-01"), endDate: null, payMonth: null, isActive: true, ...o });
const emp = (o: Partial<EmployeeInput> = {}): EmployeeInput => ({ payType: "MONTHLY", baseSalary: SRD(15_000), hourlyRate: 0, hoursPerWeek: 40, pensionEmployeeBp: 0, pensionEmployerBp: 0, numberOfChildren: 0, employedFraction: 1, age: 35, ...o });
const period = (o: Partial<PeriodInput> = {}): PeriodInput => ({ hoursWorked: null, overtime1Hours: 0, overtime2Hours: 0, overtime1RateBp: 15000, overtime2RateBp: 20000, bonus: 0, unpaidDays: 0, ytdBonusExemptUsed: 0, ...o });
const comp = (o: Partial<ComponentInput>): ComponentInput => ({ code: "X", name: "X", kind: "ALLOWANCE", calcType: "FIXED", taxTreatment: "TAXABLE", exemptLimit: 0, preTax: false, amount: 0, rateBp: 0, ...o });

describe("scheduleFor", () => {
  it("processes monthly and per-period components in every period within validity", () => {
    expect(scheduleFor(a({}), 2026, 1)).toBe("pay");
    expect(scheduleFor(a({ frequency: "PER_PERIOD" }), 2026, 7)).toBe("pay");
    expect(scheduleFor(a({ startDate: d("2026-03-15") }), 2026, 2)).toBe("skip");
    expect(scheduleFor(a({ startDate: d("2026-03-15") }), 2026, 3)).toBe("pay"); // starts mid-month: included in that month
    expect(scheduleFor(a({ endDate: d("2026-05-31") }), 2026, 5)).toBe("pay");
    expect(scheduleFor(a({ endDate: d("2026-05-31") }), 2026, 6)).toBe("skip");
  });

  it("never processes inactive components", () => {
    expect(scheduleFor(a({ isActive: false }), 2026, 1)).toBe("skip");
  });

  it("processes one-off components only in the period of the payment date", () => {
    const one = a({ frequency: "ONE_OFF", startDate: d("2026-06-20") });
    expect(scheduleFor(one, 2026, 5)).toBe("skip");
    expect(scheduleFor(one, 2026, 6)).toBe("pay");
    expect(scheduleFor(one, 2026, 7)).toBe("skip");
  });

  it("processes annual components in the payment month (default: start month), every year", () => {
    expect(scheduleFor(a({ frequency: "ANNUAL", startDate: d("2026-03-01") }), 2026, 3)).toBe("pay");
    expect(scheduleFor(a({ frequency: "ANNUAL", startDate: d("2026-03-01") }), 2026, 4)).toBe("skip");
    expect(scheduleFor(a({ frequency: "ANNUAL", startDate: d("2026-03-01") }), 2027, 3)).toBe("pay");
    expect(scheduleFor(a({ frequency: "ANNUAL", payMonth: 12 }), 2026, 12)).toBe("pay");
    expect(scheduleFor(a({ frequency: "ANNUAL", payMonth: 12 }), 2026, 1)).toBe("skip");
  });

  it("accrues every month and pays out in the payment month or at the end date", () => {
    const acc = a({ frequency: "ACCRUAL" });
    expect(scheduleFor(acc, 2026, 1)).toBe("accrue");
    expect(scheduleFor(acc, 2026, 11)).toBe("accrue");
    expect(scheduleFor(acc, 2026, 12)).toBe("accrueAndPay"); // default December
    expect(scheduleFor(a({ frequency: "ACCRUAL", payMonth: 6 }), 2026, 6)).toBe("accrueAndPay");
    expect(scheduleFor(a({ frequency: "ACCRUAL", endDate: d("2026-08-31") }), 2026, 8)).toBe("accrueAndPay");
  });

  it("carries the most recent accrual balance forward", () => {
    const slips = [
      { year: 2026, month: 1, trace: { accruals: { x: { accrued: 100, paid: 0, balance: 100 } } } },
      { year: 2026, month: 3, trace: { accruals: { x: { accrued: 100, paid: 0, balance: 300 } } } },
      { year: 2026, month: 2, trace: { accruals: { x: { accrued: 100, paid: 0, balance: 200 } } } },
      { year: 2026, month: 4, trace: {} },
    ];
    expect(priorAccrual(slips, "x")).toBe(300);
    expect(priorAccrual(slips, "y")).toBe(0);
  });
});

describe("engine: accruals and line sources", () => {
  const rules = SB_2024_2.rules;
  const aov = AOV_RESEARCH.rules;
  const holiday = (pay: boolean, prior: number) => comp({ code: "BON006", name: "Vakantietoelage", calcType: "PERCENT_OF_BASE", rateBp: 800, taxTreatment: "SPECIAL_REWARD", source: "FIXED", accrual: { id: "h", prior, pay } });

  it("records the accrual without paying it out in accrual-only months", () => {
    const base = calculatePayslip(emp(), period(), [], rules, aov);
    const r = calculatePayslip(emp(), period(), [holiday(false, SRD(2_400))], rules, aov);
    expect(r.trace.accruals).toEqual({ h: { code: "BON006", name: "Vakantietoelage", accrued: SRD(1_200), paid: 0, balance: SRD(3_600) } });
    expect(r.grossPay).toBe(base.grossPay);
    expect(r.netPay).toBe(base.netPay);
    expect(r.lines.some((l) => l.code === "BON006")).toBe(false);
  });

  it("pays out the period amount plus the earlier balance as a separate line in the payout month", () => {
    const r = calculatePayslip(emp(), period(), [holiday(true, SRD(13_200))], rules, aov);
    const line = r.lines.find((l) => l.code === "BON006")!;
    expect(line.amount).toBe(SRD(14_400)); // 12 × 8% of 15,000
    expect(line.source).toBe("FIXED");
    expect(r.trace.accruals).toMatchObject({ h: { paid: SRD(14_400), balance: 0 } });
    expect(r.trace.specialRewards).toBe(SRD(14_400)); // taxed as special reward, not as regular wage
  });

  it("tags every line with its source", () => {
    const r = calculatePayslip(emp({ pensionEmployeeBp: 300 }), period({ overtime1Hours: 2 }), [
      comp({ code: "ALW001", amount: SRD(500), source: "FIXED" }),
      comp({ code: "BON007", amount: SRD(1_000), taxTreatment: "SPECIAL_REWARD", source: "INCIDENTAL" }),
      comp({ code: "DED004", kind: "DEDUCTION", amount: SRD(200), source: "FIXED" }),
    ], rules, aov);
    const src = Object.fromEntries(r.lines.map((l) => [l.code, l.source]));
    expect(src).toMatchObject({ SAL001: "BASE", OT1: "INCIDENTAL", ALW001: "FIXED", BON007: "INCIDENTAL", DED004: "FIXED", LB: "STATUTORY", AOV: "STATUTORY", PENS: "STATUTORY" });
  });
});

describe("engine: AOV base flag", () => {
  it("honours an explicit AOV exclusion of a taxable allowance under the taxable-wage base", () => {
    const rules = SB_2024_2.rules;
    const aov = AOV_RESEARCH.rules; // base = TAXABLE_WAGE
    const incl = calculatePayslip(emp(), period(), [comp({ code: "ALW005", amount: SRD(1_000), aovIncluded: true })], rules, aov);
    const excl = calculatePayslip(emp(), period(), [comp({ code: "ALW005", amount: SRD(1_000), aovIncluded: false })], rules, aov);
    expect(incl.aovBase - excl.aovBase).toBe(SRD(1_000));
    expect(incl.aov - excl.aov).toBe(SRD(40)); // 4%
    expect(excl.wageTax).toBe(incl.wageTax); // wage tax is unaffected by the AOV flag
    expect((excl.trace.aov as { excludedAllowances: number }).excludedAllowances).toBe(SRD(1_000));
  });
});

describe("payslip summary", () => {
  const rules = SB_2024_2.rules;
  const aov = AOV_RESEARCH.rules;

  it("shows the 12 totals and adds up without double counting", () => {
    const r = calculatePayslip(emp(), period(), [
      comp({ code: "ALW002", amount: SRD(300), source: "FIXED" }), // taxable telephone allowance
      comp({ code: "ALW001", amount: SRD(400), taxTreatment: "EXEMPT", source: "FIXED" }), // explicitly exempt reimbursement
      comp({ code: "BON007", amount: SRD(1_000), taxTreatment: "SPECIAL_REWARD", source: "INCIDENTAL" }),
      comp({ code: "DED006", kind: "DEDUCTION", amount: SRD(250), source: "FIXED" }),
    ], rules, aov);
    const lines = r.lines.map((l) => ({ ...l, source: l.source ?? null }));
    const s = payslipSummary({ grossPay: r.grossPay, taxableWage: r.taxableWage, wageTax: r.totalTax, aov: r.aov, totalDeductions: r.totalDeductions, netPay: r.netPay, trace: r.trace }, lines);
    expect(SUMMARY_ROWS).toHaveLength(14);
    expect(s.baseSalary).toBe(SRD(15_000));
    expect(s.fixedAllowances).toBe(SRD(700));
    expect(s.incidentalAllowances).toBe(SRD(1_000));
    expect(s.grossPay).toBe(s.baseSalary + s.fixedAllowances + s.incidentalAllowances);
    expect(s.otherDeductions).toBe(SRD(250));
    expect(s.totalDeductions).toBe(s.wageTax + s.aov + s.otherDeductions);
    expect(s.exemptReimbursements).toBe(SRD(400));
    expect(s.netSalary + s.exemptReimbursements).toBe(s.totalPayable);
    expect(s.totalPayable).toBe(s.grossPay - s.totalDeductions);
  });

  it("classifies lines of payslips calculated before sources were stored", () => {
    expect(lineSource({ type: "EARNING", code: "SAL001", amount: 1 })).toBe("BASE");
    expect(lineSource({ type: "EARNING", code: "LEV006", amount: 0 })).toBe("LEAVE");
    expect(lineSource({ type: "DEDUCTION", code: "LB", amount: 1 })).toBe("STATUTORY");
    expect(lineSource({ type: "EARNING", code: "BONUS", amount: 1 })).toBe("INCIDENTAL");
    expect(lineSource({ type: "EARNING", code: "KB", amount: 1 })).toBe("FIXED");
    expect(lineSource({ type: "EARNING", code: "KB", amount: 1, source: "INCIDENTAL" })).toBe("INCIDENTAL");
  });
});
