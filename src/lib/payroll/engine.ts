/**
 * ARA Payroll calculation engine — Surinamese payroll rules.
 *
 * Pure and deterministic: no database or framework access, so it can be unit tested
 * and reused by other ARA products. All money is integer cents (SRD); all rates are
 * basis points (10000 = 100%).
 *
 * Calculation order (per month):
 *  1. Base pay (monthly salary prorated for partial months / unpaid days, or hours × rate)
 *  2. Overtime pay (taxed separately under the special overtime rates)
 *  3. Recurring and one-off allowances, split into taxable / exempt parts
 *  4. Pre-tax deductions (employee pension and components marked pre-tax)
 *  5. Wage tax (Loonbelasting): forfaitaire aftrek, annualised bracket table, heffingskorting
 *  6. Special reward tax (bijzondere beloning) above the annual exemption
 *  7. AOV premium over the wage above the monthly franchise
 *  8. Post-tax deductions, net pay and employer costs
 */

export type Bracket = { upTo: number | null; rateBp: number };

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
}

export type TaxTreatment = "TAXABLE" | "EXEMPT" | "EXEMPT_UP_TO_LIMIT" | "CHILD_ALLOWANCE";

export interface ComponentInput {
  code: string;
  name: string;
  kind: "ALLOWANCE" | "DEDUCTION";
  calcType: "FIXED" | "PERCENT_OF_BASE";
  taxTreatment: TaxTreatment;
  exemptLimit: number;
  preTax: boolean;
  amount: number;
  rateBp: number;
}

export interface EmployeeInput {
  payType: "MONTHLY" | "HOURLY";
  baseSalary: number;
  hourlyRate: number;
  hoursPerWeek: number;
  pensionEmployeeBp: number;
  pensionEmployerBp: number;
  numberOfChildren: number;
  /** Fraction (0–1) of the period the employee was employed (hire/termination mid-month). */
  employedFraction: number;
}

export interface PeriodInput {
  hoursWorked: number | null;
  overtime1Hours: number;
  overtime2Hours: number;
  overtime1RateBp: number;
  overtime2RateBp: number;
  bonus: number;
  unpaidDays: number;
  /** Bonus exemption already used earlier in the same calendar year. */
  ytdBonusExemptUsed: number;
}

export interface PayslipLineResult {
  type: "EARNING" | "DEDUCTION" | "EMPLOYER";
  code: string;
  description: string;
  quantity?: number;
  rate?: number;
  amount: number;
}

export interface PayrollResult {
  lines: PayslipLineResult[];
  grossPay: number;
  taxableWage: number;
  wageTax: number;
  overtimeTax: number;
  bonusTax: number;
  totalTax: number;
  aov: number;
  pensionEmployee: number;
  pensionEmployer: number;
  totalDeductions: number;
  netPay: number;
  employerCost: number;
  bonusExemptUsed: number;
  trace: Record<string, number>;
}

/** Average working days per month (261 working days / 12). */
export const WORKING_DAYS_PER_MONTH = 21.75;
/** Average weeks per month (52 / 12). */
export const WEEKS_PER_MONTH = 52 / 12;

export const round = (v: number) => Math.round(v);
export const applyBp = (amount: number, bp: number) => round((amount * bp) / 10000);

/** Progressive tax over a bracket table. `upTo` values are cumulative upper bounds. */
export function progressiveTax(amount: number, brackets: Bracket[]): number {
  if (amount <= 0) return 0;
  let tax = 0;
  let lower = 0;
  for (const b of brackets) {
    const upper = b.upTo ?? Infinity;
    if (amount > lower) {
      const slice = Math.min(amount, upper) - lower;
      tax += (slice * b.rateBp) / 10000;
    }
    if (amount <= upper) break;
    lower = upper;
  }
  return round(tax);
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

export function hourlyRateOf(emp: EmployeeInput): number {
  if (emp.payType === "HOURLY") return emp.hourlyRate;
  const monthlyHours = emp.hoursPerWeek * WEEKS_PER_MONTH;
  return monthlyHours > 0 ? emp.baseSalary / monthlyHours : 0;
}

export function calculatePayslip(
  emp: EmployeeInput,
  period: PeriodInput,
  components: ComponentInput[],
  rules: TaxRules,
): PayrollResult {
  const lines: PayslipLineResult[] = [];
  const trace: Record<string, number> = {};
  const fraction = Math.min(1, Math.max(0, emp.employedFraction));

  // 1. Base pay
  let basePay: number;
  if (emp.payType === "HOURLY") {
    const hours = period.hoursWorked ?? round(emp.hoursPerWeek * WEEKS_PER_MONTH * fraction * 100) / 100;
    basePay = round(hours * emp.hourlyRate);
    lines.push({ type: "EARNING", code: "BASE", description: "Hourly wages", quantity: hours, rate: emp.hourlyRate, amount: basePay });
  } else {
    const contractual = round(emp.baseSalary * fraction);
    lines.push({
      type: "EARNING",
      code: "BASE",
      description: fraction < 1 ? "Base salary (prorated)" : "Base salary",
      quantity: fraction < 1 ? Math.round(fraction * 10000) / 10000 : undefined,
      amount: contractual,
    });
    basePay = contractual;
    if (period.unpaidDays > 0) {
      const dailyRate = emp.baseSalary / WORKING_DAYS_PER_MONTH;
      const unpaid = Math.min(contractual, round(dailyRate * period.unpaidDays));
      basePay -= unpaid;
      lines.push({ type: "EARNING", code: "UNPAID", description: "Unpaid leave", quantity: period.unpaidDays, rate: round(dailyRate), amount: -unpaid });
    }
  }
  trace.basePay = basePay;
  // Components expressed as % of base use the contractual (unprorated) monthly salary basis.
  const componentBase = emp.payType === "HOURLY" ? basePay : round(emp.baseSalary * fraction);

  // 2. Overtime
  const hourly = hourlyRateOf(emp);
  const ot1 = round(period.overtime1Hours * hourly * (period.overtime1RateBp / 10000));
  const ot2 = round(period.overtime2Hours * hourly * (period.overtime2RateBp / 10000));
  if (ot1 > 0) lines.push({ type: "EARNING", code: "OT1", description: `Overtime ${period.overtime1RateBp / 100}%`, quantity: period.overtime1Hours, rate: round(hourly * period.overtime1RateBp / 10000), amount: ot1 });
  if (ot2 > 0) lines.push({ type: "EARNING", code: "OT2", description: `Overtime ${period.overtime2RateBp / 100}%`, quantity: period.overtime2Hours, rate: round(hourly * period.overtime2RateBp / 10000), amount: ot2 });
  const overtimePay = ot1 + ot2;
  trace.overtimePay = overtimePay;

  // 3. Allowances
  let taxableAllowances = 0;
  let exemptAllowances = 0;
  const childCap = rules.childAllowanceExempt * Math.min(emp.numberOfChildren, rules.childAllowanceMaxChildren);
  const allowances = components.filter((c) => c.kind === "ALLOWANCE");
  for (const c of allowances) {
    const amount = c.calcType === "PERCENT_OF_BASE" ? applyBp(componentBase, c.rateBp) : c.amount;
    if (amount === 0) continue;
    let exempt = 0;
    switch (c.taxTreatment) {
      case "EXEMPT":
        exempt = amount;
        break;
      case "EXEMPT_UP_TO_LIMIT":
        exempt = Math.min(amount, c.exemptLimit);
        break;
      case "CHILD_ALLOWANCE":
        exempt = Math.min(amount, childCap);
        break;
    }
    exempt = Math.max(0, exempt);
    exemptAllowances += exempt;
    taxableAllowances += amount - exempt;
    lines.push({ type: "EARNING", code: c.code, description: c.name, amount });
  }
  trace.taxableAllowances = taxableAllowances;
  trace.exemptAllowances = exemptAllowances;

  // Special reward (bijzondere beloning)
  const bonus = Math.max(0, period.bonus);
  const bonusExemptRemaining = Math.max(0, rules.bonusExemptAnnual - period.ytdBonusExemptUsed);
  const bonusExemptUsed = Math.min(bonus, bonusExemptRemaining);
  const taxableBonus = bonus - bonusExemptUsed;
  if (bonus > 0) lines.push({ type: "EARNING", code: "BONUS", description: "Special reward (bijzondere beloning)", amount: bonus });
  trace.taxableBonus = taxableBonus;

  const grossPay = basePay + overtimePay + taxableAllowances + exemptAllowances + bonus;

  // 4. Pre-tax deductions
  const pensionEmployee = applyBp(componentBase, emp.pensionEmployeeBp);
  const pensionEmployer = applyBp(componentBase, emp.pensionEmployerBp);
  const deductions = components.filter((c) => c.kind === "DEDUCTION");
  const deductionAmounts = deductions.map((c) => ({
    c,
    amount: c.calcType === "PERCENT_OF_BASE" ? applyBp(componentBase, c.rateBp) : c.amount,
  }));
  const preTaxDeductions = pensionEmployee + deductionAmounts.filter((d) => d.c.preTax).reduce((s, d) => s + d.amount, 0);

  // 5. Wage tax on the regular wage
  const regularWage = basePay + taxableAllowances;
  const regularTaxable = Math.max(0, regularWage - preTaxDeductions);
  const lumpSum = Math.min(applyBp(regularTaxable, rules.lumpSumRateBp), round(rules.lumpSumCapAnnual / 12));
  const monthlyTaxable = Math.max(0, regularTaxable - lumpSum);
  const annualTaxable = monthlyTaxable * 12;
  const annualTax = progressiveTax(annualTaxable, rules.brackets);
  const wageTax = Math.max(0, round(annualTax / 12) - rules.taxCreditMonthly);
  Object.assign(trace, { regularTaxable, lumpSum, monthlyTaxable, annualTaxable, annualTax, taxCredit: rules.taxCreditMonthly, wageTax });

  // 6. Bonus tax: marginal tax of adding the taxable bonus to the annual wage
  const bonusTax = taxableBonus > 0
    ? progressiveTax(annualTaxable + taxableBonus, rules.brackets) - annualTax
    : 0;
  trace.bonusTax = bonusTax;

  // Overtime tax (special monthly overtime rates)
  const overtimeTax = progressiveTax(overtimePay, rules.overtimeBrackets);
  trace.overtimeTax = overtimeTax;

  // 7. AOV over wage above franchise
  const aovBase = Math.max(0, basePay + taxableAllowances + overtimePay + bonus - rules.aovFranchiseMonthly);
  const aov = applyBp(aovBase, rules.aovRateBp);
  trace.aovBase = aovBase;

  if (wageTax > 0) lines.push({ type: "DEDUCTION", code: "LB", description: "Wage tax (loonbelasting)", amount: wageTax });
  if (bonusTax > 0) lines.push({ type: "DEDUCTION", code: "LB-BB", description: "Wage tax on special reward", amount: bonusTax });
  if (overtimeTax > 0) lines.push({ type: "DEDUCTION", code: "LB-OT", description: "Wage tax on overtime", amount: overtimeTax });
  if (aov > 0) lines.push({ type: "DEDUCTION", code: "AOV", description: "AOV premium", rate: rules.aovRateBp, amount: aov });
  if (pensionEmployee > 0) lines.push({ type: "DEDUCTION", code: "PENS", description: "Pension contribution", rate: emp.pensionEmployeeBp, amount: pensionEmployee });

  // 8. Other deductions
  let otherDeductions = 0;
  for (const { c, amount } of deductionAmounts) {
    if (amount === 0) continue;
    otherDeductions += amount;
    lines.push({ type: "DEDUCTION", code: c.code, description: c.name, amount });
  }

  const totalTax = wageTax + bonusTax + overtimeTax;
  const totalDeductions = totalTax + aov + pensionEmployee + otherDeductions;
  const netPay = grossPay - totalDeductions;
  if (pensionEmployer > 0) lines.push({ type: "EMPLOYER", code: "PENS-ER", description: "Employer pension contribution", rate: emp.pensionEmployerBp, amount: pensionEmployer });
  const employerCost = grossPay + pensionEmployer;

  return {
    lines,
    grossPay,
    taxableWage: regularTaxable + overtimePay + taxableBonus,
    wageTax,
    overtimeTax,
    bonusTax,
    totalTax,
    aov,
    pensionEmployee,
    pensionEmployer,
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
