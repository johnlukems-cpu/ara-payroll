/**
 * Contribution schemes: employee share deducted, employer share as employer cost only; percentage and
 * fixed amounts, bases, maximum base, tax treatment, pension precedence and payslip sections.
 */
import { describe, expect, it } from "vitest";
import { calculatePayslip, type ComponentInput, type ContributionInput, type EmployeeInput, type PeriodInput } from "@/lib/payroll/engine";
import { SB_2024_2, AOV_RESEARCH } from "@/lib/payroll/defaults";
import { effectiveShares, schemeApplies } from "@/lib/payroll/contributions";
import { lineGroup, payslipSections } from "@/lib/payroll/summary";

const SRD = (v: number) => Math.round(v * 100);
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const rules = SB_2024_2.rules;
const aov = AOV_RESEARCH.rules;
const emp = (o: Partial<EmployeeInput> = {}): EmployeeInput => ({ payType: "MONTHLY", baseSalary: SRD(20_000), hourlyRate: 0, hoursPerWeek: 40, pensionEmployeeBp: 0, pensionEmployerBp: 0, numberOfChildren: 0, employedFraction: 1, age: 35, ...o });
const period = (o: Partial<PeriodInput> = {}): PeriodInput => ({ hoursWorked: null, overtime1Hours: 0, overtime2Hours: 0, overtime1RateBp: 15000, overtime2RateBp: 20000, bonus: 0, unpaidDays: 0, ytdBonusExemptUsed: 0, ...o });
const scheme = (o: Partial<ContributionInput>): ContributionInput => ({ id: "s", type: "HEALTH", name: "ZKV", method: "PERCENTAGE", base: "BASE_SALARY", employeeRateBp: 0, employerRateBp: 0, employeeAmount: 0, employerAmount: 0, maxBase: null, preTax: false, showEmployer: true, ...o });
const comp = (o: Partial<ComponentInput>): ComponentInput => ({ code: "X", name: "X", kind: "ALLOWANCE", calcType: "FIXED", taxTreatment: "TAXABLE", exemptLimit: 0, preTax: false, amount: 0, rateBp: 0, ...o });

describe("contribution schemes in the engine", () => {
  it("deducts the employee share and adds the employer share to employer costs only", () => {
    const base = calculatePayslip(emp(), period(), [], rules, aov);
    const r = calculatePayslip(emp(), period(), [], rules, aov, [scheme({ employeeRateBp: 250, employerRateBp: 500 })]);
    expect(r.lines.find((l) => l.code === "HEALTH-EE")).toMatchObject({ type: "DEDUCTION", amount: SRD(500), group: "HEALTH", rate: 250 });
    expect(r.lines.find((l) => l.code === "HEALTH-ER")).toMatchObject({ type: "EMPLOYER", amount: SRD(1_000), group: "HEALTH" });
    expect(r.netPay).toBe(base.netPay - SRD(500)); // employer share never reduces net pay
    expect(r.employerCost).toBe(base.employerCost + SRD(1_000));
    expect(r.totalDeductions).toBe(base.totalDeductions + SRD(500));
    expect(r.wageTax).toBe(base.wageTax); // after-tax deduction
    expect(r.contributions).toEqual([{ id: "s", type: "HEALTH", employee: SRD(500), employer: SRD(1_000) }]);
  });

  it("supports fixed amounts and an employer-only share", () => {
    const r = calculatePayslip(emp(), period(), [], rules, aov, [scheme({ type: "FVO", method: "FIXED", employeeAmount: 0, employerAmount: SRD(150) })]);
    expect(r.lines.some((l) => l.code === "FVO-EE")).toBe(false);
    expect(r.lines.find((l) => l.code === "FVO-ER")?.amount).toBe(SRD(150));
    expect(r.netPay).toBe(calculatePayslip(emp(), period(), [], rules, aov).netPay);
  });

  it("applies a minimum base (e.g. statutory minimum pension base) only when there is a wage", () => {
    const low = calculatePayslip(emp({ baseSalary: SRD(1_500) }), period(), [], rules, aov, [scheme({ type: "PENSION", employeeRateBp: 400, employerRateBp: 400, minBase: SRD(2_250), maxBase: SRD(22_500) })]);
    expect(low.lines.find((l) => l.code === "PENSION-EE")?.amount).toBe(SRD(90)); // 4% of the minimum base 2,250
    const high = calculatePayslip(emp({ baseSalary: SRD(30_000) }), period(), [], rules, aov, [scheme({ type: "PENSION", employeeRateBp: 400, employerRateBp: 400, minBase: SRD(2_250), maxBase: SRD(22_500) })]);
    expect(high.lines.find((l) => l.code === "PENSION-EE")?.amount).toBe(SRD(900)); // 4% of the maximum base 22,500
    const none = calculatePayslip(emp({ baseSalary: SRD(1_500), employedFraction: 0 }), period(), [], rules, aov, [scheme({ type: "PENSION", employeeRateBp: 400, minBase: SRD(2_250) })]);
    expect(none.lines.some((l) => l.code === "PENSION-EE")).toBe(false);
  });

  it("applies the maximum base and the chosen calculation base", () => {
    const capped = calculatePayslip(emp(), period(), [], rules, aov, [scheme({ employeeRateBp: 1000, maxBase: SRD(10_000) })]);
    expect(capped.lines.find((l) => l.code === "HEALTH-EE")?.amount).toBe(SRD(1_000));
    const gross = calculatePayslip(emp(), period(), [comp({ code: "ALW001", amount: SRD(2_000) })], rules, aov, [scheme({ base: "GROSS_WAGE", employeeRateBp: 100 })]);
    expect(gross.lines.find((l) => l.code === "HEALTH-EE")?.amount).toBe(SRD(220)); // 1% of 22,000
    const baseOnly = calculatePayslip(emp(), period(), [comp({ code: "ALW001", amount: SRD(2_000) })], rules, aov, [scheme({ base: "BASE_SALARY", employeeRateBp: 100 })]);
    expect(baseOnly.lines.find((l) => l.code === "HEALTH-EE")?.amount).toBe(SRD(200));
  });

  it("reduces the taxable wage only for pre-tax employee shares", () => {
    const after = calculatePayslip(emp(), period(), [], rules, aov, [scheme({ type: "PENSION", employeeRateBp: 500 })]);
    const pre = calculatePayslip(emp(), period(), [], rules, aov, [scheme({ type: "PENSION", employeeRateBp: 500, preTax: true })]);
    expect(pre.taxableWage).toBe(after.taxableWage - SRD(1_000));
    expect(pre.wageTax).toBeLessThan(after.wageTax);
  });

  it("replaces the contract pension percentages by a pension scheme (never both)", () => {
    const contract = calculatePayslip(emp({ pensionEmployeeBp: 300, pensionEmployerBp: 500 }), period(), [], rules, aov);
    expect(contract.lines.some((l) => l.code === "PENS")).toBe(true);
    const r = calculatePayslip(emp({ pensionEmployeeBp: 300, pensionEmployerBp: 500 }), period(), [], rules, aov, [scheme({ type: "PENSION", employeeRateBp: 400, employerRateBp: 600 })]);
    expect(r.lines.some((l) => l.code === "PENS" || l.code === "PENS-ER")).toBe(false);
    expect(r.lines.find((l) => l.code === "PENSION-EE")?.amount).toBe(SRD(800));
    expect(r.trace.pensionSource).toBe("SCHEME");
  });

  it("keeps a hidden employer share in employer costs and reports it as unspecified", () => {
    const r = calculatePayslip(emp(), period(), [], rules, aov, [scheme({ employerRateBp: 500, showEmployer: false })]);
    const er = r.lines.find((l) => l.code === "HEALTH-ER")!;
    expect(er.showOnPayslip).toBe(false);
    const sec = payslipSections({ grossPay: r.grossPay, totalDeductions: r.totalDeductions, netPay: r.netPay, employerCost: r.employerCost }, r.lines.map((l) => ({ ...l, showOnPayslip: l.showOnPayslip ?? true })));
    expect(sec.employer).toHaveLength(0);
    expect(sec.hiddenEmployer).toBe(SRD(1_000));
    expect(sec.totalEmployerCost).toBe(r.grossPay + SRD(1_000));
  });
});

describe("payslip sections", () => {
  it("groups income, employee deductions and employer contributions", () => {
    const r = calculatePayslip(emp(), period({ overtime1Hours: 2 }), [
      comp({ code: "ALW002", amount: SRD(300), source: "FIXED" }),
      comp({ code: "BON006", libraryCode: "BON006", amount: SRD(1_600), taxTreatment: "SPECIAL_REWARD", source: "FIXED" }),
      comp({ code: "BON007", libraryCode: "BON007", amount: SRD(1_000), taxTreatment: "SPECIAL_REWARD", source: "INCIDENTAL", category: "BONUS" }),
      comp({ code: "ALW015", libraryCode: "ALW015", amount: SRD(250), taxTreatment: "EXEMPT", source: "FIXED" }),
      comp({ code: "DED006", kind: "DEDUCTION", amount: SRD(100), source: "FIXED" }),
    ], rules, aov, [scheme({ type: "FVO", employeeRateBp: 50, employerRateBp: 100 })]);
    const s = payslipSections({ grossPay: r.grossPay, totalDeductions: r.totalDeductions, netPay: r.netPay, employerCost: r.employerCost }, r.lines);
    expect(s.income.map((x) => x.group)).toEqual(["BASE", "FIXED", "VARIABLE", "HOLIDAY", "BONUS", "REIMBURSEMENT"]);
    expect(s.income.reduce((a, x) => a + x.total, 0)).toBe(r.grossPay);
    expect(s.deductions.map((x) => x.group)).toEqual(["WAGE_TAX", "AOV", "FVO", "OTHER"]);
    expect(s.deductions.reduce((a, x) => a + x.total, 0)).toBe(r.totalDeductions);
    expect(s.employer.map((x) => x.group)).toEqual(["FVO"]);
    expect(s.netPayable).toBe(r.grossPay - r.totalDeductions);
  });

  it("classifies lines of older payslips by code", () => {
    expect(lineGroup({ type: "DEDUCTION", code: "PENS", amount: 1 })).toBe("PENSION");
    expect(lineGroup({ type: "EMPLOYER", code: "PENS-ER", amount: 1 })).toBe("PENSION");
    expect(lineGroup({ type: "DEDUCTION", code: "DED004", amount: 1 })).toBe("HEALTH");
    expect(lineGroup({ type: "DEDUCTION", code: "LB-BB", amount: 1 })).toBe("WAGE_TAX");
    expect(lineGroup({ type: "EARNING", code: "BON006", amount: 1 })).toBe("HOLIDAY");
    expect(lineGroup({ type: "EARNING", code: "BONUS", amount: 1 })).toBe("BONUS");
    expect(lineGroup({ type: "EARNING", code: "SAL001", amount: 1 })).toBe("BASE");
    expect(lineGroup({ type: "EARNING", code: "KB", amount: 1 })).toBe("FIXED");
  });
});

describe("scheme applicability", () => {
  const s = { isActive: true, appliesToAll: true, effectiveFrom: d("2026-01-01"), effectiveTo: null as Date | null };
  const p = [d("2026-03-01"), d("2026-03-31")] as const;
  it("applies to everyone unless opted out, within its validity", () => {
    expect(schemeApplies(s, null, ...p)).toBe(true);
    expect(schemeApplies({ ...s, isActive: false }, null, ...p)).toBe(false);
    expect(schemeApplies({ ...s, effectiveFrom: d("2026-04-01") }, null, ...p)).toBe(false);
    expect(schemeApplies(s, { participates: false, startDate: null, endDate: null }, ...p)).toBe(false);
    expect(schemeApplies(s, { participates: false, startDate: d("2026-05-01"), endDate: null }, ...p)).toBe(true);
  });
  it("applies only to enrolled employees when not for everyone", () => {
    expect(schemeApplies({ ...s, appliesToAll: false }, null, ...p)).toBe(false);
    expect(schemeApplies({ ...s, appliesToAll: false }, { participates: true, startDate: d("2026-02-01"), endDate: null }, ...p)).toBe(true);
    expect(schemeApplies({ ...s, appliesToAll: false }, { participates: true, startDate: null, endDate: d("2026-02-28") }, ...p)).toBe(false);
  });
  it("uses individual rates when set", () => {
    expect(effectiveShares({ employeeRateBp: 200, employerRateBp: 400, employeeAmount: 0, employerAmount: 0 }, { employeeRateBp: 300, employerRateBp: null, employeeAmount: null, employerAmount: null }))
      .toEqual({ employeeRateBp: 300, employerRateBp: 400, employeeAmount: 0, employerAmount: 0 });
  });
});

import nlMessages from "../../messages/nl.json";
import enMessages from "../../messages/en.json";
import { formatPlanPrice, planHref, PLANS } from "@/lib/pricing";

describe("pricing configuration", () => {
  it("has the four plans with the agreed prices, Business as popular, and texts for every feature in both languages", () => {
    expect(PLANS.map((p) => [p.id, p.priceSrd])).toEqual([["starter", 750], ["business", 1500], ["professional", 2750], ["enterprise", null]]);
    expect(PLANS.filter((p) => p.popular).map((p) => p.id)).toEqual(["business"]);
    for (const m of [nlMessages, enMessages]) {
      for (const p of PLANS) {
        const plan = (m.pricing.plans as Record<string, { features: Record<string, string> }>)[p.id];
        expect(Object.keys(plan.features)).toHaveLength(p.features);
      }
    }
  });
  it("formats prices per language and links to working pages", () => {
    expect(formatPlanPrice(1500, "nl")).toBe("SRD 1.500");
    expect(formatPlanPrice(2750, "en")).toBe("SRD 2,750");
    expect(PLANS.map(planHref)).toEqual(["/register?plan=starter", "/register?plan=business", "/register?plan=professional", "/contact?type=quote&plan=enterprise"]);
  });
});

import { isEffective, schemeIssues, schemeState, statutoryGaps, type SchemeLike } from "@/lib/payroll/contributions";

describe("scheme validation", () => {
  const now = d("2026-03-15");
  const base: SchemeLike = {
    type: "HEALTH", basis: "STATUTORY", method: "PERCENTAGE", employeeRateBp: 0, employerRateBp: 0, employeeAmount: 0, employerAmount: 0,
    isActive: false, approvedAt: null, notApplicable: false, effectiveFrom: d("2026-01-01"), effectiveTo: null, legalStatus: "PENDING_VERIFICATION", legalReference: "ref",
  };
  const configured = { ...base, employeeRateBp: 200, employerRateBp: 300 };
  const approved = { ...configured, approvedAt: d("2026-01-02") };
  const active = { ...approved, isActive: true };

  it("derives the lifecycle state", () => {
    expect(schemeState(base, now)).toBe("NOT_CONFIGURED");
    expect(schemeState(configured, now)).toBe("AWAITING_APPROVAL");
    expect(schemeState(approved, now)).toBe("INACTIVE");
    expect(schemeState(active, now)).toBe("ACTIVE");
    expect(schemeState({ ...active, effectiveFrom: d("2026-06-01") }, now)).toBe("FUTURE");
    expect(schemeState({ ...active, effectiveTo: d("2026-02-28") }, now)).toBe("ENDED");
    expect(schemeState({ ...base, notApplicable: true }, now)).toBe("NOT_APPLICABLE");
    expect(schemeState({ ...base, method: "FIXED", employerAmount: 100 }, now)).toBe("AWAITING_APPROVAL");
  });

  it("only uses active, approved and configured schemes in payroll", () => {
    expect([base, configured, approved, active, { ...active, notApplicable: true }].map(isEffective)).toEqual([false, false, false, true, false]);
  });

  it("reports blocking issues for statutory schemes and warnings otherwise", () => {
    expect(schemeIssues(base)).toEqual([{ code: "NOT_CONFIGURED", blocking: true }, { code: "LEGAL_UNVERIFIED", blocking: false }]);
    expect(schemeIssues(configured)[0]).toEqual({ code: "AWAITING_APPROVAL", blocking: true });
    expect(schemeIssues(approved)[0]).toEqual({ code: "NOT_ACTIVE", blocking: true });
    expect(schemeIssues({ ...active, legalStatus: "VERIFIED" })).toEqual([]);
    expect(schemeIssues({ ...base, basis: "VOLUNTARY" })).toEqual([{ code: "NOT_CONFIGURED", blocking: false }]);
    expect(schemeIssues({ ...active, legalReference: null }).map((i) => i.code)).toContain("NO_LEGAL_REFERENCE");
    expect(schemeIssues({ ...base, notApplicable: true })).toEqual([]);
  });

  it("warns when the employer pays less than the employee for a statutory scheme (employer at least half)", () => {
    expect(schemeIssues({ ...active, legalStatus: "VERIFIED", employeeRateBp: 600, employerRateBp: 400 })).toEqual([{ code: "EMPLOYER_SHARE_BELOW_HALF", blocking: false }]);
    expect(schemeIssues({ ...active, legalStatus: "VERIFIED", employeeRateBp: 400, employerRateBp: 400 })).toEqual([]);
    expect(schemeIssues({ ...active, basis: "VOLUNTARY", employeeRateBp: 600, employerRateBp: 400 })).toEqual([]);
  });

  it("treats a pension covered by employment contracts as no gap", () => {
    const p = [d("2026-03-01"), d("2026-03-31")] as const;
    const pension = { ...base, type: "PENSION" as const };
    expect(statutoryGaps([pension], ...p)).toEqual(["PENSION"]);
    expect(statutoryGaps([pension], ...p, ["PENSION"])).toEqual([]);
  });

  it("finds statutory types without a usable scheme in a period", () => {
    const p = [d("2026-03-01"), d("2026-03-31")] as const;
    const fvo = { ...base, type: "FVO" as const };
    const pension = { ...base, type: "PENSION" as const, basis: "VOLUNTARY" as const };
    expect(statutoryGaps([base, fvo, pension], ...p)).toEqual(["HEALTH", "FVO"]); // voluntary pension never blocks
    expect(statutoryGaps([active, fvo], ...p)).toEqual(["FVO"]);
    expect(statutoryGaps([active, { ...fvo, notApplicable: true }], ...p)).toEqual([]);
    // A new draft version does not create a gap while the approved version still covers the period.
    expect(statutoryGaps([active, { ...configured, effectiveFrom: d("2026-03-01") }, { ...fvo, notApplicable: true }], ...p)).toEqual([]);
    // Statutory schemes starting after the period do not block it.
    expect(statutoryGaps([{ ...base, effectiveFrom: d("2026-04-01") }], ...p)).toEqual([]);
  });
});
