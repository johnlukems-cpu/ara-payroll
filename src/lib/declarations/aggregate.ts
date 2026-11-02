/**
 * Aggregates finalized payroll into a declaration snapshot. Pure: input is plain payslip data.
 * Amounts are minor units in the statutory calculation currency (SRD); a snapshot is immutable once
 * the declaration is approved, so later rule changes never alter declared figures.
 */
export type SlipForDeclaration = {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  idNumber: string | null;
  month: number;
  runId: string;
  calcCurrency: string;
  grossPay: number;
  taxableWage: number;
  wageTax: number;
  aov: number;
  aovEmployer: number;
  aovBaseAmount: number;
  legalStatus: string;
  lines: { code: string; amount: number }[];
  taxRuleSet: string | null;
  aovRuleSet: string | null;
};

export type DeclarationEmployeeRow = {
  employeeId: string;
  number: string;
  name: string;
  idNumber: string | null;
  months: number;
  gross: number;
  taxable: number;
  wageTaxRegular: number;
  wageTaxSpecial: number;
  wageTaxOvertime: number;
  wageTax: number;
  aovBase: number;
  aov: number;
  aovEmployer: number;
};

export type DeclarationSnapshot = {
  company: { name: string; legalName: string | null; kkfNumber: string | null; taxNumber: string | null; address: string | null; district: string | null };
  period: { year: number; month: number };
  currency: string;
  employees: DeclarationEmployeeRow[];
  totals: { employeeCount: number; gross: number; taxable: number; wageTaxRegular: number; wageTaxSpecial: number; wageTaxOvertime: number; wageTax: number; aovBase: number; aov: number; aovEmployer: number };
  runIds: string[];
  ruleSets: { tax: string[]; aov: string[] };
  legalPending: boolean;
  mixedCurrencies: boolean;
  generatedAt: string;
};

const sumCodes = (lines: { code: string; amount: number }[], codes: string[]) => lines.filter((l) => codes.includes(l.code)).reduce((s, l) => s + l.amount, 0);

export function aggregateDeclaration(company: DeclarationSnapshot["company"], period: { year: number; month: number }, slips: SlipForDeclaration[]): DeclarationSnapshot {
  const rows = new Map<string, DeclarationEmployeeRow & { monthSet: Set<number> }>();
  for (const s of slips) {
    const r = rows.get(s.employeeId) ?? { employeeId: s.employeeId, number: s.employeeNumber, name: s.employeeName, idNumber: s.idNumber, months: 0, gross: 0, taxable: 0, wageTaxRegular: 0, wageTaxSpecial: 0, wageTaxOvertime: 0, wageTax: 0, aovBase: 0, aov: 0, aovEmployer: 0, monthSet: new Set<number>() };
    r.monthSet.add(s.month);
    r.gross += s.grossPay;
    r.taxable += s.taxableWage;
    r.wageTaxRegular += sumCodes(s.lines, ["LB"]);
    r.wageTaxSpecial += sumCodes(s.lines, ["LB-BB"]);
    r.wageTaxOvertime += sumCodes(s.lines, ["LB-OT"]);
    r.wageTax += s.wageTax;
    r.aovBase += s.aovBaseAmount;
    r.aov += s.aov;
    r.aovEmployer += s.aovEmployer;
    rows.set(s.employeeId, r);
  }
  const employees = [...rows.values()].map(({ monthSet, ...r }) => ({ ...r, months: monthSet.size })).sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
  const sumOf = (k: keyof DeclarationEmployeeRow) => employees.reduce((s, r) => s + (r[k] as number), 0);
  const currencies = new Set(slips.map((s) => s.calcCurrency));
  return {
    company,
    period,
    currency: [...currencies][0] ?? "SRD",
    employees,
    totals: {
      employeeCount: employees.length,
      gross: sumOf("gross"), taxable: sumOf("taxable"), wageTaxRegular: sumOf("wageTaxRegular"), wageTaxSpecial: sumOf("wageTaxSpecial"),
      wageTaxOvertime: sumOf("wageTaxOvertime"), wageTax: sumOf("wageTax"), aovBase: sumOf("aovBase"), aov: sumOf("aov"), aovEmployer: sumOf("aovEmployer"),
    },
    runIds: [...new Set(slips.map((s) => s.runId))],
    ruleSets: { tax: [...new Set(slips.map((s) => s.taxRuleSet).filter(Boolean) as string[])], aov: [...new Set(slips.map((s) => s.aovRuleSet).filter(Boolean) as string[])] },
    legalPending: slips.length === 0 || slips.some((s) => s.legalStatus !== "VALIDATED"),
    mixedCurrencies: currencies.size > 1,
    generatedAt: new Date().toISOString(),
  };
}

/** Amount payable: wage tax + AOV (employee and employer shares) + adjustments from earlier periods. */
export function payable(snapshot: DeclarationSnapshot, previousAdjustments = 0) {
  return snapshot.totals.wageTax + snapshot.totals.aov + snapshot.totals.aovEmployer + previousAdjustments;
}
