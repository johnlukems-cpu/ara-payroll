/**
 * Payslip summary (the 12 totals shown on the payslip, on screen and in the PDF).
 * Pure: works on stored payslip lines, so historical payslips are summarised from what was stored.
 */
export type LineSource = "BASE" | "FIXED" | "INCIDENTAL" | "STATUTORY" | "LEAVE";

type Line = { type: string; code: string; amount: number; source?: string | null };

const STATUTORY = new Set(["LB", "LB-BB", "LB-OT", "AOV", "PENS", "AOV-ER", "PENS-ER"]);

/** Line source; payslips calculated before sources were stored are classified by line code. */
export function lineSource(l: Line): LineSource {
  if (l.source) return l.source as LineSource;
  if (/^SAL\d{3}$/.test(l.code) || l.code === "BASE") return "BASE";
  if (l.code === "UNPAID" || /^LEV\d{3}$/.test(l.code) || l.code.startsWith("LEAVE-")) return "LEAVE";
  if (STATUTORY.has(l.code)) return "STATUTORY";
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
}

export function payslipSummary(
  slip: { grossPay: number; taxableWage: number; wageTax: number; aov: number; totalDeductions: number; netPay: number; trace?: unknown },
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
  };
}

export const SUMMARY_ROWS: (keyof PayslipSummary)[] = [
  "baseSalary", "fixedAllowances", "incidentalAllowances", "grossPay", "taxableBase", "wageTax", "aov",
  "otherDeductions", "totalDeductions", "netSalary", "exemptReimbursements", "totalPayable",
];
