/**
 * Payslip summary (the 12 totals shown on the payslip, on screen and in the PDF).
 * Pure: works on stored payslip lines, so historical payslips are summarised from what was stored.
 */
export type LineSource = "BASE" | "FIXED" | "INCIDENTAL" | "STATUTORY" | "LEAVE" | "CONTRIBUTION";

type Line = { type: string; code: string; amount: number; source?: string | null };

const STATUTORY = new Set(["LB", "LB-BB", "LB-OT", "AOV", "PENS", "AOV-ER", "PENS-ER"]);
const CONTRIBUTION = new Set(["HEALTH-EE", "HEALTH-ER", "PENSION-EE", "PENSION-ER", "FVO-EE", "FVO-ER"]);

/** Line source; payslips calculated before sources were stored are classified by line code. */
export function lineSource(l: Line): LineSource {
  if (l.source) return l.source as LineSource;
  if (/^SAL\d{3}$/.test(l.code) || l.code === "BASE") return "BASE";
  if (l.code === "UNPAID" || /^LEV\d{3}$/.test(l.code) || l.code.startsWith("LEAVE-")) return "LEAVE";
  if (STATUTORY.has(l.code)) return "STATUTORY";
  if (CONTRIBUTION.has(l.code)) return "CONTRIBUTION";
  if (l.code === "OT1" || l.code === "OT2" || l.code === "BONUS") return "INCIDENTAL";
  return "FIXED";
}

export interface PayslipSummary {
  baseSalary: number;
  fixedAllowances: number;
  incidentalAllowances: number;
  grossPay: number;
  taxableBase: number;
  wageTax: number;
  aov: number;
  otherDeductions: number;
  totalDeductions: number;
  netSalary: number;
  exemptReimbursements: number;
  totalPayable: number;
  employerContributions: number;
  totalEmploymentCost: number;
}

export function payslipSummary(
  slip: { grossPay: number; taxableWage: number; wageTax: number; aov: number; totalDeductions: number; netPay: number; employerCost?: number; trace?: unknown },
  lines: Line[],
): PayslipSummary {
  const earnings = lines.filter((l) => l.type === "EARNING");
  const sum = (src: LineSource[]) => earnings.filter((l) => src.includes(lineSource(l))).reduce((s, l) => s + l.amount, 0);
  const trace = (slip.trace ?? {}) as { exemptPaidAllowances?: number; exemptAllowances?: number };
  const exempt = Math.max(0, Number(trace.exemptPaidAllowances ?? trace.exemptAllowances ?? 0));
  return {
    baseSalary: sum(["BASE", "LEAVE"]),
    fixedAllowances: sum(["FIXED"]),
    incidentalAllowances: sum(["INCIDENTAL"]),
    grossPay: slip.grossPay,
    taxableBase: slip.taxableWage,
    wageTax: slip.wageTax,
    aov: slip.aov,
    otherDeductions: slip.totalDeductions - slip.wageTax - slip.aov,
    totalDeductions: slip.totalDeductions,
    netSalary: slip.netPay - exempt,
    exemptReimbursements: exempt,
    totalPayable: slip.netPay,
    employerContributions: (slip.employerCost ?? slip.grossPay) - slip.grossPay,
    totalEmploymentCost: slip.employerCost ?? slip.grossPay,
  };
}

export const SUMMARY_ROWS: (keyof PayslipSummary)[] = [
  "baseSalary", "fixedAllowances", "incidentalAllowances", "grossPay", "taxableBase", "wageTax", "aov",
  "otherDeductions", "totalDeductions", "netSalary", "exemptReimbursements", "totalPayable",
  "employerContributions", "totalEmploymentCost",
];

/**
 * Payslip sections. Earnings: base salary, fixed and variable allowances, holiday allowance, gratuity/bonus,
 * other (tax-free) reimbursements. Employee deductions and employer contributions: wage tax, AOV, health
 * insurance, pension, FVO and other. Stored on each line at calculation time; derived from the code for older payslips.
 */
export type LineGroup = "BASE" | "FIXED" | "VARIABLE" | "HOLIDAY" | "BONUS" | "REIMBURSEMENT" | "WAGE_TAX" | "AOV" | "HEALTH" | "PENSION" | "FVO" | "OTHER";
export const EARNING_GROUPS: LineGroup[] = ["BASE", "FIXED", "VARIABLE", "HOLIDAY", "BONUS", "REIMBURSEMENT"];
export const DEDUCTION_GROUPS: LineGroup[] = ["WAGE_TAX", "AOV", "HEALTH", "PENSION", "FVO", "OTHER"];
export const EMPLOYER_GROUPS: LineGroup[] = ["HEALTH", "PENSION", "FVO", "AOV", "OTHER"];

const CODE_GROUP: Record<string, LineGroup> = {
  LB: "WAGE_TAX", "LB-BB": "WAGE_TAX", "LB-OT": "WAGE_TAX", AOV: "AOV", "AOV-ER": "AOV", DED011: "AOV", ER006: "AOV",
  PENS: "PENSION", "PENS-ER": "PENSION", "PENSION-EE": "PENSION", "PENSION-ER": "PENSION", DED002: "PENSION", DED013: "PENSION", ER001: "PENSION",
  "HEALTH-EE": "HEALTH", "HEALTH-ER": "HEALTH", DED004: "HEALTH", ER002: "HEALTH",
  "FVO-EE": "FVO", "FVO-ER": "FVO", DED012: "FVO", ER007: "FVO",
  BON006: "HOLIDAY", BONUS: "BONUS", OT1: "VARIABLE", OT2: "VARIABLE",
};

export function lineGroup(l: Line & { group?: string | null; libraryCode?: string | null; taxTreatment?: string | null; category?: string | null }): LineGroup {
  if (l.group) return l.group as LineGroup;
  const byCode = CODE_GROUP[l.libraryCode ?? ""] ?? CODE_GROUP[l.code];
  if (byCode) return byCode;
  if (l.type !== "EARNING") return "OTHER";
  const src = lineSource(l);
  if (src === "BASE" || src === "LEAVE") return "BASE";
  if (l.taxTreatment === "SPECIAL_REWARD" || l.category === "BONUS" || /^BON\d{3}$/.test(l.code)) return "BONUS";
  if (l.taxTreatment === "EXEMPT" || l.taxTreatment === "EXEMPT_UP_TO_LIMIT") return "REIMBURSEMENT";
  if (l.taxTreatment === "OVERTIME" || l.category === "OVERTIME") return "VARIABLE";
  return src === "INCIDENTAL" ? "VARIABLE" : "FIXED";
}

type SectionLine = Line & { group?: string | null; showOnPayslip?: boolean | null };
export type Section<L> = { group: LineGroup; total: number; lines: L[] };

/** Payslip broken down into income, employee deductions and employer contributions, with totals. */
export function payslipSections<L extends SectionLine>(slip: { grossPay: number; totalDeductions: number; netPay: number; employerCost: number }, lines: L[]) {
  const sections = (type: string, groups: LineGroup[], filter: (l: L) => boolean = () => true) => groups
    .map((g) => {
      const ls = lines.filter((l) => l.type === type && lineGroup(l) === g && filter(l));
      return { group: g, total: ls.reduce((s, l) => s + l.amount, 0), lines: ls };
    })
    .filter((s) => s.lines.length > 0);
  const employerLines = lines.filter((l) => l.type === "EMPLOYER");
  const hiddenEmployer = employerLines.filter((l) => l.showOnPayslip === false).reduce((s, l) => s + l.amount, 0);
  const employerTotal = employerLines.reduce((s, l) => s + l.amount, 0);
  return {
    income: sections("EARNING", EARNING_GROUPS),
    grossPay: slip.grossPay,
    deductions: sections("DEDUCTION", DEDUCTION_GROUPS),
    totalDeductions: slip.totalDeductions,
    netPayable: slip.netPay,
    employer: sections("EMPLOYER", EMPLOYER_GROUPS, (l) => l.showOnPayslip !== false),
    hiddenEmployer,
    employerTotal,
    totalEmployerCost: slip.employerCost,
  };
}
