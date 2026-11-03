/**
 * ARA Payroll calculation engine — Surinamese payroll rules.
 *
 * Pure and deterministic: no database or framework access, so it can be unit tested
 * and reused by other ARA products. All money is integer minor units (cents) in the
 * statutory calculation currency; all rates are basis points (10000 = 100%).
 *
 * Calculation order (per month):
 *  1. Base pay by pay type (month / week / day / hour), prorated for partial months
 *  2. Approved leave adjustments (only where the approved leave policy pays < 100%)
 *  3. Pay components resolved by calculation method (fixed, % of base, % of component,
 *     hours × rate, days × rate, quantity × price, formula, manual)
 *  4. Overtime (special overtime brackets) and special rewards (bijzondere beloningen)
 *  5. Pre-tax deductions (employee pension and components marked pre-tax)
 *  6. Wage tax: beroepskostenaftrek → zuiver loon → belastingvrije som → progressive brackets
 *  7. AOV premium per its own rule set (base, franchise, min/max, employee/employer share, age)
 *  8. Other deductions, net pay, employer contributions (never deducted from net)
 */

import { evaluateFormula, formulaVariables, FormulaError } from "./formula";
import { lineGroup, type LineGroup } from "./summary";
import { employeeCode, employerCode, type ContributionType } from "./contributions";

export type Bracket = { upTo: number | null; rateBp: number; fixed?: number };

export interface TaxRules {
  brackets: Bracket[];
  taxCreditMonthly: number;
  lumpSumRateBp: number;
  lumpSumCapAnnual: number;
  aovRateBp: number;
  aovFranchiseMonthly: number;
  overtimeBrackets: Bracket[];
  childAllowanceExempt: number;
  childAllowanceMaxChildren: number;
  bonusExemptAnnual: number;
  /** Belastingvrije som per year. 0 = legacy tables where the tax-free part is a 0% bracket. */
  taxFreeAnnual?: number;
  taxFreeMonthly?: number;
  lumpSumMode?: "PERCENT_CAPPED" | "FIXED";
  lumpSumMonthly?: number;
  calcMethod?: "ANNUALIZED" | "MONTHLY_TABLE";
}

export interface AovRules {
  rateBp: number;
  base: "TAXABLE_WAGE" | "GROSS_WAGE";
  franchiseMonthly: number;
  minMonthly?: number | null;
  maxMonthly?: number | null;
  employeeShareBp: number;
  exemptFromAge?: number | null;
}

export type TaxTreatment = "TAXABLE" | "EXEMPT" | "EXEMPT_UP_TO_LIMIT" | "CHILD_ALLOWANCE" | "SPECIAL_REWARD" | "OVERTIME";
export type CalcType = "FIXED" | "PERCENT_OF_BASE" | "PERCENT_OF_COMPONENT" | "HOURS_X_RATE" | "DAYS_X_RATE" | "QTY_X_PRICE" | "FORMULA" | "MANUAL";

export interface ComponentInput {
  code: string;
  name: string;
  labels?: { nl?: string; en?: string };
  kind: "ALLOWANCE" | "DEDUCTION" | "EMPLOYER";
  calcType: CalcType;
  taxTreatment: TaxTreatment;
  exemptLimit: number;
  preTax: boolean;
  /** FIXED / MANUAL amount (minor units, calculation currency). */
  amount: number;
  rateBp: number;
  quantity?: number | null;
  multiplierBp?: number;
  unitPrice?: number;
  baseComponentCode?: string | null;
  formula?: string | null;
  aovIncluded?: boolean;
  pensionIncluded?: boolean;
  /** ALLOWANCE only: NONE = taxable benefit in kind (part of gross, not paid out). */
  netEffect?: "ADD" | "DEDUCT" | "NONE";
  /** FIXED = employee's fixed component, INCIDENTAL = added to this payslip only. */
  source?: "FIXED" | "INCIDENTAL";
  /**
   * Accrual (e.g. holiday allowance built up during the year): the period amount is always
   * resolved and recorded in trace.accruals[id]; it is only paid (with the prior balance) when pay is true.
   */
  accrual?: { id: string; prior: number; pay: boolean };
  /** Used to place the line in the right payslip section (holiday allowance, bonus, reimbursement, …). */
  libraryCode?: string | null;
  category?: string | null;
}

/**
 * A contribution scheme applying to the employee: the employee share is deducted, the employer share is an
 * employer cost only. Amounts are monthly, in the calculation currency.
 */
export interface ContributionInput {
  id: string;
  type: ContributionType;
  name: string;
  labels?: { nl?: string; en?: string };
  method: "PERCENTAGE" | "FIXED";
  base: "BASE_SALARY" | "PENSION_BASE" | "REGULAR_WAGE" | "GROSS_WAGE";
  employeeRateBp: number;
  employerRateBp: number;
  employeeAmount: number;
  employerAmount: number;
  /** Maximum monthly base (calculation currency); null = no maximum. */
  maxBase: number | null;
  /** Minimum monthly base (calculation currency), e.g. a statutory minimum pension base; null = none. */
  minBase?: number | null;
  /** Employee share deducted before wage tax. */
  preTax: boolean;
  /** Print the employer share on the payslip (it always counts as employer cost). */
  showEmployer: boolean;
}

export interface LeaveInput {
  code: string;
  label: string;
  labels?: { nl?: string; en?: string };
  /** Leave working days falling in this period (already scaled for part-time leave). */
  days: number;
  /** Share of salary that continues to be paid (10000 = fully paid). */
  payPercentBp: number;
  /** Show a zero-amount line for fully paid leave (e.g. parental leave) for traceability. */
  informational?: boolean;
}

export interface EmployeeInput {
  payType: "MONTHLY" | "WEEKLY" | "DAILY" | "HOURLY";
  baseSalary: number;
  hourlyRate: number;
  hoursPerWeek: number;
  pensionEmployeeBp: number;
  pensionEmployerBp: number;
  numberOfChildren: number;
  /** Fraction (0–1) of the period the employee was employed (hire/termination mid-month). */
  employedFraction: number;
  /** Age on the last day of the period (for AOV age limits); null when unknown. */
  age?: number | null;
}

export interface PeriodInput {
  hoursWorked: number | null;
  daysWorked?: number | null;
  overtime1Hours: number;
  overtime2Hours: number;
  overtime1RateBp: number;
  overtime2RateBp: number;
  bonus: number;
  unpaidDays: number;
  /** Bonus exemption already used earlier in the same calendar year. */
  ytdBonusExemptUsed: number;
  leave?: LeaveInput[];
}

export type LineSource = "BASE" | "FIXED" | "INCIDENTAL" | "STATUTORY" | "LEAVE";

export interface PayslipLineResult {
  type: "EARNING" | "DEDUCTION" | "EMPLOYER";
  source?: LineSource | "CONTRIBUTION";
  group?: LineGroup;
  showOnPayslip?: boolean;
  code: string;
  description: string;
  labels?: { nl?: string; en?: string };
  quantity?: number;
  rate?: number;
  amount: number;
}

export type BracketSlice = { from: number; to: number | null; rateBp: number; taxable: number; tax: number };

export interface PayrollResult {
  lines: PayslipLineResult[];
  grossPay: number;
  taxableWage: number;
  wageTax: number;
  overtimeTax: number;
  bonusTax: number;
  totalTax: number;
  aov: number;
  aovEmployer: number;
  aovBase: number;
  pensionEmployee: number;
  pensionEmployer: number;
  employerContributions: number;
  /** Employee and employer share per contribution scheme type. */
  contributions: { id: string; type: ContributionType; employee: number; employer: number }[];
  totalDeductions: number;
  netPay: number;
  employerCost: number;
  bonusExemptUsed: number;
  trace: Record<string, unknown>;
}

/** Average working days per month (261 working days / 12). */
export const WORKING_DAYS_PER_MONTH = 21.75;
/** Average weeks per month (52 / 12). */
export const WEEKS_PER_MONTH = 52 / 12;

export const round = (v: number) => Math.round(v);
export const applyBp = (amount: number, bp: number) => round((amount * bp) / 10000);

/** Progressive tax over a bracket table with cumulative upper bounds; returns the total and the per-bracket slices. */
export function progressiveTaxDetail(amount: number, brackets: Bracket[]): { tax: number; slices: BracketSlice[] } {
  const slices: BracketSlice[] = [];
  if (amount <= 0) return { tax: 0, slices };
  let total = 0;
  let lower = 0;
  for (const b of brackets) {
    const upper = b.upTo ?? Infinity;
    if (amount > lower) {
      const taxable = Math.min(amount, upper) - lower;
      const tax = (taxable * b.rateBp) / 10000 + (b.fixed ?? 0);
      total += tax;
      slices.push({ from: lower, to: b.upTo, rateBp: b.rateBp, taxable, tax: round(tax) });
    }
    if (amount <= upper) break;
    lower = upper;
  }
  return { tax: round(total), slices };
}

export function progressiveTax(amount: number, brackets: Bracket[]): number {
  return progressiveTaxDetail(amount, brackets).tax;
}

/** Returns null when valid, otherwise an error code (translation key under "bracket.") and the 1-based row. */
export function validateBrackets(brackets: Bracket[]): { code: "required" | "rate" | "openOnlyLast" | "increase" | "lastOpen"; row?: number } | null {
  if (brackets.length === 0) return { code: "required" };
  let prev = 0;
  for (let i = 0; i < brackets.length; i++) {
    const b = brackets[i];
    if (b.rateBp < 0 || b.rateBp > 10000) return { code: "rate", row: i + 1 };
    if (b.upTo === null) {
      if (i !== brackets.length - 1) return { code: "openOnlyLast" };
    } else {
      if (b.upTo <= prev) return { code: "increase", row: i + 1 };
      prev = b.upTo;
    }
  }
  if (brackets[brackets.length - 1].upTo !== null) return { code: "lastOpen" };
  return null;
}

/** Contractual monthly-equivalent pay, hourly and daily rates for an employee. */
export function payRates(emp: EmployeeInput) {
  const hpw = emp.hoursPerWeek > 0 ? emp.hoursPerWeek : 40;
  switch (emp.payType) {
    case "WEEKLY":
      return { monthly: emp.baseSalary * WEEKS_PER_MONTH, hourly: emp.baseSalary / hpw, daily: emp.baseSalary / 5 };
    case "DAILY":
      return { monthly: emp.baseSalary * WORKING_DAYS_PER_MONTH, hourly: emp.baseSalary / (hpw / 5), daily: emp.baseSalary };
    case "HOURLY":
      return { monthly: emp.hourlyRate * hpw * WEEKS_PER_MONTH, hourly: emp.hourlyRate, daily: (emp.hourlyRate * hpw) / 5 };
    default:
      return { monthly: emp.baseSalary, hourly: emp.baseSalary / (hpw * WEEKS_PER_MONTH), daily: emp.baseSalary / WORKING_DAYS_PER_MONTH };
  }
}

export function hourlyRateOf(emp: EmployeeInput): number {
  return payRates(emp).hourly;
}

export class ComponentError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/**
 * Resolves component amounts by calculation method. Components may depend on each other
 * (PERCENT_OF_COMPONENT, FORMULA); they are evaluated in dependency order and cycles are rejected.
 */
export function resolveComponentAmounts(components: ComponentInput[], ctx: { base: number; hourly: number; daily: number }): number[] {
  const amounts = new Array<number | undefined>(components.length);
  const byCode = new Map<string, number[]>();
  components.forEach((c, i) => byCode.set(c.code, [...(byCode.get(c.code) ?? []), i]));
  const deps = (c: ComponentInput): string[] => {
    if (c.calcType === "PERCENT_OF_COMPONENT") return c.baseComponentCode ? [c.baseComponentCode] : [];
    if (c.calcType === "FORMULA" && c.formula) return formulaVariables(c.formula).filter((v) => byCode.has(v));
    return [];
  };
  const visiting = new Set<number>();
  const totalOf = (code: string, path: number[]) => (byCode.get(code) ?? []).reduce((s, j) => s + resolve(j, path), 0);
  const resolve = (i: number, path: number[]): number => {
    if (amounts[i] !== undefined) return amounts[i]!;
    const c = components[i];
    if (visiting.has(i)) throw new ComponentError(c.code, `Circular component reference: ${[...path, i].map((j) => components[j].code).join(" → ")}`);
    visiting.add(i);
    const qty = c.quantity ?? 0;
    const mult = (c.multiplierBp ?? 10000) / 10000;
    let v: number;
    switch (c.calcType) {
      case "PERCENT_OF_BASE":
        v = applyBp(ctx.base, c.rateBp);
        break;
      case "PERCENT_OF_COMPONENT":
        if (!c.baseComponentCode || !byCode.has(c.baseComponentCode)) { v = 0; break; }
        v = applyBp(totalOf(c.baseComponentCode, [...path, i]), c.rateBp);
        break;
      case "HOURS_X_RATE":
        v = round(qty * ctx.hourly * mult);
        break;
      case "DAYS_X_RATE":
        v = round(qty * ctx.daily * mult);
        break;
      case "QTY_X_PRICE":
        v = round(qty * (c.unitPrice ?? 0));
        break;
      case "FORMULA": {
        if (!c.formula) { v = 0; break; }
        const vars: Record<string, number> = { BASE: ctx.base / 100, HOURLY_RATE: ctx.hourly / 100, DAILY_RATE: ctx.daily / 100, QTY: qty };
        for (const d of deps(c)) vars[d] = totalOf(d, [...path, i]) / 100;
        try {
          v = round(evaluateFormula(c.formula, vars) * 100);
        } catch (e) {
          throw new ComponentError(c.code, e instanceof FormulaError ? e.message : String(e));
        }
        break;
      }
      default: // FIXED, MANUAL
        v = c.amount;
    }
    visiting.delete(i);
    amounts[i] = Math.max(0, v);
    return amounts[i]!;
  };
  components.forEach((_, i) => resolve(i, []));
  return amounts as number[];
}

/** Legacy AOV behaviour derived from a tax rule set (before AOV had its own rule sets). */
export const legacyAovRules = (r: TaxRules): AovRules => ({ rateBp: r.aovRateBp, base: "GROSS_WAGE", franchiseMonthly: r.aovFranchiseMonthly, employeeShareBp: 10000 });

export function calculatePayslip(
  emp: EmployeeInput,
  period: PeriodInput,
  components: ComponentInput[],
  rules: TaxRules,
  aovRules: AovRules = legacyAovRules(rules),
  contributions: ContributionInput[] = [],
): PayrollResult {
  const lines: PayslipLineResult[] = [];
  const trace: Record<string, unknown> = {};
  const fraction = Math.min(1, Math.max(0, emp.employedFraction));
  const rates = payRates(emp);

  // 1. Base pay
  let basePay: number;
  if (emp.payType === "HOURLY") {
    const hours = period.hoursWorked ?? round(emp.hoursPerWeek * WEEKS_PER_MONTH * fraction * 100) / 100;
    basePay = round(hours * emp.hourlyRate);
    lines.push({ type: "EARNING", source: "BASE", code: "SAL004", description: "Hourly wages", quantity: hours, rate: emp.hourlyRate, amount: basePay });
  } else if (emp.payType === "DAILY") {
    const days = period.daysWorked ?? round(WORKING_DAYS_PER_MONTH * fraction * 100) / 100;
    basePay = round(days * emp.baseSalary);
    lines.push({ type: "EARNING", source: "BASE", code: "SAL003", description: "Daily wages", quantity: days, rate: emp.baseSalary, amount: basePay });
  } else {
    const code = emp.payType === "WEEKLY" ? "SAL002" : fraction < 1 ? "SAL008" : "SAL001";
    basePay = round(rates.monthly * fraction);
    lines.push({
      type: "EARNING",
      source: "BASE",
      code,
      description: fraction < 1 ? "Base salary (prorated)" : "Base salary",
      quantity: fraction < 1 ? Math.round(fraction * 10000) / 10000 : undefined,
      rate: emp.payType === "WEEKLY" ? emp.baseSalary : undefined,
      amount: basePay,
    });
    if (period.unpaidDays > 0) {
      const unpaid = Math.min(basePay, round(rates.daily * period.unpaidDays));
      basePay -= unpaid;
      lines.push({ type: "EARNING", source: "LEAVE", code: "UNPAID", description: "Unpaid leave", quantity: period.unpaidDays, rate: round(rates.daily), amount: -unpaid });
    }
  }
  // Components expressed as % of base use the contractual (unprorated by leave) salary basis.
  const componentBase = emp.payType === "HOURLY" || emp.payType === "DAILY" ? basePay : round(rates.monthly * fraction);

  // 2. Approved leave adjustments (salaried employees; hourly/daily pay already reflects time worked)
  const leaveTrace: { code: string; days: number; payPercentBp: number; reduction: number }[] = [];
  if (emp.payType === "MONTHLY" || emp.payType === "WEEKLY") {
    for (const l of period.leave ?? []) {
      if (l.days <= 0) continue;
      const reduction = Math.min(basePay, round((rates.daily * l.days * (10000 - Math.min(10000, Math.max(0, l.payPercentBp)))) / 10000));
      if (reduction > 0 || l.informational) {
        basePay -= reduction;
        lines.push({ type: "EARNING", source: "LEAVE", code: l.code, description: l.label, labels: l.labels, quantity: Math.round(l.days * 100) / 100, rate: l.payPercentBp, amount: -reduction });
        leaveTrace.push({ code: l.code, days: l.days, payPercentBp: l.payPercentBp, reduction });
      }
    }
  }
  trace.leave = leaveTrace;
  trace.basePay = basePay;
  trace.rates = { monthly: round(rates.monthly), hourly: round(rates.hourly), daily: round(rates.daily) };

  // 3. Components
  const resolved = resolveComponentAmounts(components, { base: componentBase, hourly: rates.hourly, daily: rates.daily });
  // Accruals: record the period amount; only pay out (period amount + earlier balance) in the payout period.
  const accruals: Record<string, { code: string; name: string; accrued: number; paid: number; balance: number }> = {};
  const amounts = resolved.map((v, i) => {
    const c = components[i];
    const acc = c.accrual;
    if (!acc) return v;
    const total = acc.prior + v;
    accruals[acc.id] = { code: c.code, name: c.name, accrued: v, paid: acc.pay ? total : 0, balance: acc.pay ? 0 : total };
    return acc.pay ? total : 0;
  });
  trace.accruals = accruals;

  // Overtime from period inputs
  const ot1 = round(period.overtime1Hours * rates.hourly * (period.overtime1RateBp / 10000));
  const ot2 = round(period.overtime2Hours * rates.hourly * (period.overtime2RateBp / 10000));
  if (ot1 > 0) lines.push({ type: "EARNING", source: "INCIDENTAL", code: "OT1", description: `Overtime ${period.overtime1RateBp / 100}%`, quantity: period.overtime1Hours, rate: round(rates.hourly * period.overtime1RateBp / 10000), amount: ot1 });
  if (ot2 > 0) lines.push({ type: "EARNING", source: "INCIDENTAL", code: "OT2", description: `Overtime ${period.overtime2RateBp / 100}%`, quantity: period.overtime2Hours, rate: round(rates.hourly * period.overtime2RateBp / 10000), amount: ot2 });
  let overtimePay = ot1 + ot2;

  // Special reward from period input
  let rewards = Math.max(0, period.bonus);
  if (rewards > 0) lines.push({ type: "EARNING", source: "INCIDENTAL", code: "BONUS", description: "Special reward (bijzondere beloning)", amount: rewards });

  let taxableAllowances = 0;
  let exemptAllowances = 0;
  let aovAllowances = 0;
  // Taxable allowance amounts explicitly excluded from the AOV base (component/employee setting "AOV base: no").
  let aovExcluded = 0;
  let pensionAllowances = 0;
  let benefitsInKind = 0;
  let employerContributions = 0;
  const childCap = rules.childAllowanceExempt * Math.min(emp.numberOfChildren, rules.childAllowanceMaxChildren);
  let exemptPaidAllowances = 0;
  const lineMeta = (c: ComponentInput, amount: number) => ({
    source: c.source ?? ("FIXED" as const),
    group: lineGroup({ type: c.kind === "ALLOWANCE" ? "EARNING" : c.kind === "DEDUCTION" ? "DEDUCTION" : "EMPLOYER", code: c.code, amount, source: c.source ?? "FIXED", libraryCode: c.libraryCode, taxTreatment: c.taxTreatment, category: c.category }),
    code: c.code,
    description: c.name,
    labels: c.labels,
    quantity: c.quantity ?? undefined,
    rate: c.calcType === "PERCENT_OF_BASE" || c.calcType === "PERCENT_OF_COMPONENT" ? c.rateBp : c.calcType === "HOURS_X_RATE" || c.calcType === "DAYS_X_RATE" ? c.multiplierBp : undefined,
    amount,
  });

  components.forEach((c, i) => {
    const amount = amounts[i];
    if (amount === 0 || c.kind !== "ALLOWANCE") return;
    switch (c.taxTreatment) {
      case "OVERTIME":
        overtimePay += amount;
        break;
      case "SPECIAL_REWARD":
        rewards += amount;
        break;
      default: {
        let exempt = 0;
        if (c.taxTreatment === "EXEMPT") exempt = amount;
        else if (c.taxTreatment === "EXEMPT_UP_TO_LIMIT") exempt = Math.min(amount, c.exemptLimit);
        else if (c.taxTreatment === "CHILD_ALLOWANCE") exempt = Math.min(amount, childCap);
        exempt = Math.max(0, exempt);
        exemptAllowances += exempt;
        if (c.netEffect !== "NONE") exemptPaidAllowances += exempt;
        taxableAllowances += amount - exempt;
        if (c.aovIncluded ?? c.taxTreatment === "TAXABLE") aovAllowances += amount - exempt;
        else if (c.aovIncluded === false) aovExcluded += amount - exempt;
      }
    }
    if (c.pensionIncluded) pensionAllowances += amount;
    if (c.netEffect === "NONE") benefitsInKind += amount;
    lines.push({ type: "EARNING", ...lineMeta(c, amount) });
  });
  trace.overtimePay = overtimePay;
  trace.taxableAllowances = taxableAllowances;
  trace.exemptAllowances = exemptAllowances;
  trace.exemptPaidAllowances = exemptPaidAllowances;

  const bonusExemptRemaining = Math.max(0, rules.bonusExemptAnnual - period.ytdBonusExemptUsed);
  const bonusExemptUsed = Math.min(rewards, bonusExemptRemaining);
  const taxableBonus = rewards - bonusExemptUsed;
  trace.specialRewards = rewards;
  trace.taxableBonus = taxableBonus;

  const grossPay = basePay + overtimePay + taxableAllowances + exemptAllowances + rewards;

  // 4. Pre-tax deductions
  const pensionBase = componentBase + pensionAllowances;
  // A pension scheme replaces the pension percentages of the employment contract (never both: no double deduction).
  const pensionScheme = contributions.some((c) => c.type === "PENSION");
  const pensionEmployee = pensionScheme ? 0 : applyBp(pensionBase, emp.pensionEmployeeBp);
  const pensionEmployer = pensionScheme ? 0 : applyBp(pensionBase, emp.pensionEmployerBp);
  trace.pensionSource = pensionScheme ? "SCHEME" : emp.pensionEmployeeBp || emp.pensionEmployerBp ? "CONTRACT" : "NONE";

  // Contribution schemes: employee share (deduction) and employer share (employer cost), each on its own base.
  const regularWageBeforeDeductions = basePay + taxableAllowances;
  const schemeBase = (b: ContributionInput["base"]) =>
    b === "BASE_SALARY" ? componentBase : b === "PENSION_BASE" ? pensionBase : b === "REGULAR_WAGE" ? regularWageBeforeDeductions : grossPay;
  const contrib = contributions.map((c) => {
    const raw = Math.max(0, schemeBase(c.base));
    const floored = c.minBase != null && raw > 0 ? Math.max(raw, c.minBase) : raw;
    const base = c.maxBase != null ? Math.min(floored, c.maxBase) : floored;
    const employee = Math.max(0, c.method === "FIXED" ? c.employeeAmount : applyBp(base, c.employeeRateBp));
    const employer = Math.max(0, c.method === "FIXED" ? c.employerAmount : applyBp(base, c.employerRateBp));
    return { c, base, capped: base < raw, raised: base > raw, employee, employer };
  });
  trace.contributions = contrib.map(({ c, base, capped, raised, employee, employer }) => ({
    id: c.id, type: c.type, name: c.name, method: c.method, base: c.base, baseAmount: base, capped, raised, maxBase: c.maxBase, minBase: c.minBase ?? null,
    employeeRateBp: c.employeeRateBp, employerRateBp: c.employerRateBp, employee, employer, preTax: c.preTax,
  }));
  const contribPreTax = contrib.filter((x) => x.c.preTax).reduce((s, x) => s + x.employee, 0);
  const contribEmployee = contrib.reduce((s, x) => s + x.employee, 0);
  const contribEmployer = contrib.reduce((s, x) => s + x.employer, 0);

  const deductions = components.map((c, i) => ({ c, amount: amounts[i] })).filter((d) => d.c.kind === "DEDUCTION");
  const preTaxDeductions = pensionEmployee + contribPreTax + deductions.filter((d) => d.c.preTax).reduce((s, d) => s + d.amount, 0);

  // 5. Wage tax on the regular wage
  const regularWage = basePay + taxableAllowances;
  const regularTaxable = Math.max(0, regularWage - preTaxDeductions);
  const lumpSum = rules.lumpSumMode === "FIXED"
    ? Math.min(regularTaxable, rules.lumpSumMonthly || round(rules.lumpSumCapAnnual / 12))
    : Math.min(applyBp(regularTaxable, rules.lumpSumRateBp), round(rules.lumpSumCapAnnual / 12));
  const monthlyTaxable = Math.max(0, regularTaxable - lumpSum); // zuiver loon (regular)
  const taxFreeAnnual = rules.taxFreeAnnual ?? 0;
  let annualTaxable: number;
  let wageTaxGross: number;
  let annualTax: number;
  let slices: BracketSlice[];
  if (rules.calcMethod === "MONTHLY_TABLE" && taxFreeAnnual > 0) {
    // Monthly equivalents: monthly tax-free amount and brackets / 12 (never combined with the annual amounts).
    const monthlyFree = rules.taxFreeMonthly || round(taxFreeAnnual / 12);
    const monthlyBrackets = rules.brackets.map((b) => ({ ...b, upTo: b.upTo === null ? null : round(b.upTo / 12), fixed: b.fixed ? round(b.fixed / 12) : undefined }));
    const d = progressiveTaxDetail(Math.max(0, monthlyTaxable - monthlyFree), monthlyBrackets);
    slices = d.slices;
    wageTaxGross = d.tax;
    annualTaxable = Math.max(0, monthlyTaxable * 12 - taxFreeAnnual);
    annualTax = progressiveTax(annualTaxable, rules.brackets);
    trace.taxFree = monthlyFree;
  } else {
    annualTaxable = Math.max(0, monthlyTaxable * 12 - taxFreeAnnual);
    const d = progressiveTaxDetail(annualTaxable, rules.brackets);
    slices = d.slices;
    annualTax = d.tax;
    wageTaxGross = round(annualTax / 12);
    trace.taxFree = taxFreeAnnual;
  }
  const wageTax = Math.max(0, wageTaxGross - rules.taxCreditMonthly);
  Object.assign(trace, {
    method: rules.calcMethod ?? "ANNUALIZED", regularTaxable, lumpSum, monthlyTaxable, annualZuiverLoon: monthlyTaxable * 12,
    annualTaxable, annualTax, brackets: slices, taxCredit: rules.taxCreditMonthly, wageTax,
  });

  // 6. Special reward tax: marginal tax of adding the taxable reward to the annual taxable wage
  const bonusTax = taxableBonus > 0 ? progressiveTax(annualTaxable + taxableBonus, rules.brackets) - annualTax : 0;
  trace.bonusTax = bonusTax;

  // Overtime tax (special monthly overtime brackets)
  const overtimeTax = progressiveTax(overtimePay, rules.overtimeBrackets);
  trace.overtimeTax = overtimeTax;

  // 7. AOV
  const aovExempt = aovRules.exemptFromAge != null && emp.age != null && emp.age >= aovRules.exemptFromAge;
  // The AOV flag of an allowance is honoured for both bases (exclusion only; exempt parts are never part of the base).
  const aovBaseRaw = aovRules.base === "TAXABLE_WAGE"
    ? Math.max(0, monthlyTaxable - aovExcluded) + overtimePay + taxableBonus
    : basePay + aovAllowances + overtimePay + rewards;
  const aovBase = aovExempt ? 0 : Math.max(0, aovBaseRaw - aovRules.franchiseMonthly);
  let aovTotal = applyBp(aovBase, aovRules.rateBp);
  if (aovBase > 0 && aovRules.minMonthly != null) aovTotal = Math.max(aovTotal, aovRules.minMonthly);
  if (aovRules.maxMonthly != null) aovTotal = Math.min(aovTotal, aovRules.maxMonthly);
  const aov = applyBp(aovTotal, aovRules.employeeShareBp);
  const aovEmployer = aovTotal - aov;
  trace.aov = { base: aovRules.base, baseAmount: aovBase, excludedAllowances: aovExcluded, rateBp: aovRules.rateBp, franchise: aovRules.franchiseMonthly, employeeShareBp: aovRules.employeeShareBp, exempt: aovExempt, total: aovTotal };
  trace.aovBase = aovBase;

  if (wageTax > 0) lines.push({ type: "DEDUCTION", source: "STATUTORY", code: "LB", description: "Wage tax (loonbelasting)", amount: wageTax });
  if (bonusTax > 0) lines.push({ type: "DEDUCTION", source: "STATUTORY", code: "LB-BB", description: "Wage tax on special reward", amount: bonusTax });
  if (overtimeTax > 0) lines.push({ type: "DEDUCTION", source: "STATUTORY", code: "LB-OT", description: "Wage tax on overtime", amount: overtimeTax });
  if (aov > 0) lines.push({ type: "DEDUCTION", source: "STATUTORY", code: "AOV", description: "AOV premium", rate: applyBp(aovRules.rateBp, aovRules.employeeShareBp), amount: aov });
  if (pensionEmployee > 0) lines.push({ type: "DEDUCTION", source: "STATUTORY", code: "PENS", description: "Pension contribution", rate: emp.pensionEmployeeBp, amount: pensionEmployee });
  for (const x of contrib) {
    if (x.employee > 0) lines.push({ type: "DEDUCTION", source: "CONTRIBUTION", group: x.c.type, code: employeeCode(x.c.type), description: x.c.name, labels: x.c.labels, rate: x.c.method === "PERCENTAGE" ? x.c.employeeRateBp : undefined, amount: x.employee });
  }

  // 8. Other deductions
  let otherDeductions = 0;
  for (const { c, amount } of deductions) {
    if (amount === 0) continue;
    otherDeductions += amount;
    lines.push({ type: "DEDUCTION", ...lineMeta(c, amount) });
  }

  const totalTax = wageTax + bonusTax + overtimeTax;
  const totalDeductions = totalTax + aov + pensionEmployee + contribEmployee + otherDeductions;
  const netPay = grossPay - totalDeductions - benefitsInKind;

  // Employer contributions: calculated separately, never deducted from net pay.
  if (pensionEmployer > 0) lines.push({ type: "EMPLOYER", source: "STATUTORY", code: "PENS-ER", description: "Employer pension contribution", rate: emp.pensionEmployerBp, amount: pensionEmployer });
  if (aovEmployer > 0) lines.push({ type: "EMPLOYER", source: "STATUTORY", code: "AOV-ER", description: "AOV employer share", amount: aovEmployer });
  components.forEach((c, i) => {
    if (c.kind !== "EMPLOYER" || amounts[i] === 0) return;
    employerContributions += amounts[i];
    lines.push({ type: "EMPLOYER", ...lineMeta(c, amounts[i]) });
  });
  // Employer shares of contribution schemes: employer cost only, never deducted from net pay.
  for (const x of contrib) {
    if (x.employer > 0) lines.push({ type: "EMPLOYER", source: "CONTRIBUTION", group: x.c.type, showOnPayslip: x.c.showEmployer, code: employerCode(x.c.type), description: x.c.name, labels: x.c.labels, rate: x.c.method === "PERCENTAGE" ? x.c.employerRateBp : undefined, amount: x.employer });
  }
  employerContributions += contribEmployer;
  const employerCost = grossPay + pensionEmployer + aovEmployer + employerContributions;
  trace.benefitsInKind = benefitsInKind;
  trace.employerContributions = employerContributions;

  for (const l of lines) l.group ??= lineGroup(l);
  return {
    lines,
    grossPay,
    taxableWage: monthlyTaxable + overtimePay + taxableBonus,
    wageTax,
    overtimeTax,
    bonusTax,
    totalTax,
    aov,
    aovEmployer,
    aovBase,
    pensionEmployee,
    pensionEmployer,
    employerContributions,
    contributions: contrib.map((x) => ({ id: x.c.id, type: x.c.type, employee: x.employee, employer: x.employer })),
    totalDeductions,
    netPay,
    employerCost,
    bonusExemptUsed,
    trace,
  };
}

/** Fraction of a calendar month an employee was employed. */
export function employedFraction(year: number, month: number, hireDate: Date, terminationDate: Date | null): number {
  const start = Date.UTC(year, month - 1, 1);
  const end = Date.UTC(year, month, 0); // last day
  const days = new Date(end).getUTCDate();
  const from = Math.max(start, Date.UTC(hireDate.getUTCFullYear(), hireDate.getUTCMonth(), hireDate.getUTCDate()));
  const to = terminationDate
    ? Math.min(end, Date.UTC(terminationDate.getUTCFullYear(), terminationDate.getUTCMonth(), terminationDate.getUTCDate()))
    : end;
  if (to < from) return 0;
  const employedDays = Math.round((to - from) / 86400000) + 1;
  return employedDays >= days ? 1 : employedDays / days;
}

/** Age in whole years on a given date. */
export function ageOn(dateOfBirth: Date | null | undefined, on: Date): number | null {
  if (!dateOfBirth) return null;
  let age = on.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const m = on.getUTCMonth() - dateOfBirth.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < dateOfBirth.getUTCDate())) age--;
  return age;
}
