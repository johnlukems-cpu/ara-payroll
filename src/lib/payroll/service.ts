import "server-only";
import type { Prisma, TaxRuleSet } from "@prisma/client";
import { db } from "@/lib/db";
import { calculatePayslip, employedFraction, type Bracket, type ComponentInput, type TaxRules } from "./engine";
import { RateBook } from "@/lib/server/rates";
import type { Conversion } from "@/lib/currency";

export function toRules(r: TaxRuleSet): TaxRules {
  return {
    brackets: r.brackets as unknown as Bracket[],
    taxCreditMonthly: r.taxCreditMonthly,
    lumpSumRateBp: r.lumpSumRateBp,
    lumpSumCapAnnual: r.lumpSumCapAnnual,
    aovRateBp: r.aovRateBp,
    aovFranchiseMonthly: r.aovFranchiseMonthly,
    overtimeBrackets: r.overtimeBrackets as unknown as Bracket[],
    childAllowanceExempt: r.childAllowanceExempt,
    childAllowanceMaxChildren: r.childAllowanceMaxChildren,
    bonusExemptAnnual: r.bonusExemptAnnual,
  };
}

/** Most recent rule set effective on the given date; company-specific sets override platform defaults. */
export async function findRuleSet(companyId: string, onDate: Date) {
  return db.taxRuleSet.findFirst({
    where: { effectiveFrom: { lte: onDate }, OR: [{ companyId }, { companyId: null }] },
    orderBy: [{ effectiveFrom: "desc" }, { companyId: { sort: "desc", nulls: "last" } }],
  });
}

export const periodBounds = (year: number, month: number) => ({
  start: new Date(Date.UTC(year, month - 1, 1)),
  end: new Date(Date.UTC(year, month, 0, 23, 59, 59)),
});

/** Employees eligible for a period: hired before period end and not terminated before period start. */
export function eligibleEmployeesWhere(companyId: string, year: number, month: number): Prisma.EmployeeWhereInput {
  const { start, end } = periodBounds(year, month);
  return {
    companyId,
    hireDate: { lte: end },
    OR: [{ terminationDate: null }, { terminationDate: { gte: start } }],
  };
}

/** Error carrying a translation key (and optional values) so it can be shown in the user's language. */
export class PayrollError extends Error {
  constructor(public key: string, public values?: Record<string, string | number>) {
    super(key);
  }
}

/**
 * (Re)calculates all payslips for a run. Only DRAFT and CALCULATED runs can be calculated.
 *
 * Currency handling: statutory amounts are calculated in the tax rule set's currency (SRD).
 * Salary, allowances, deductions and bonuses in other currencies are converted into that
 * currency first, using the approved exchange rate effective on the last day of the period.
 * Net pay is then converted into the employee's payment currency and all totals into the
 * company's base currency. Every conversion (amounts, rate, rate date, source) is stored on the payslip.
 */
export async function calculateRun(runId: string) {
  const run = await db.payrollRun.findUniqueOrThrow({ where: { id: runId }, include: { company: true } });
  if (run.status !== "DRAFT" && run.status !== "CALCULATED") throw new PayrollError("errors.runLocked");

  const { start, end } = periodBounds(run.year, run.month);
  const ruleSet = await findRuleSet(run.companyId, end);
  if (!ruleSet) throw new PayrollError("errors.noRuleSet");
  const rules = toRules(ruleSet);
  const calcCur = ruleSet.currency;
  const baseCur = run.company.currency;

  const employees = await db.employee.findMany({
    where: eligibleEmployeesWhere(run.companyId, run.year, run.month),
    include: {
      department: true,
      contracts: { where: { startDate: { lte: end } }, orderBy: { startDate: "desc" }, take: 1 },
      components: {
        where: { startDate: { lte: end }, OR: [{ endDate: null }, { endDate: { gte: start } }], component: { isActive: true } },
        include: { component: true },
      },
    },
  });
  const inputs = await db.payrollInput.findMany({ where: { runId } });
  const adjustments = await db.payrollAdjustment.findMany({ where: { runId }, include: { component: true } });

  // Exchange rates: collect every currency pair needed, then resolve them once.
  const currencies = await db.currency.findMany();
  const book = new RateBook(end, { companyId: run.companyId, allowApi: run.company.rateAllowApi }, new Map(currencies.map((c) => [c.code, c.decimals])));
  const pairs: [string, string][] = [[calcCur, baseCur]];
  for (const e of employees) {
    const sc = e.contracts[0]?.salaryCurrency;
    if (!sc) continue;
    pairs.push([sc, calcCur], [calcCur, e.paymentCurrency ?? sc]);
    for (const a of e.components) pairs.push([a.currency ?? sc, calcCur]);
    for (const a of adjustments.filter((x) => x.employeeId === e.id)) pairs.push([a.currency ?? sc, calcCur]);
  }
  await book.prepare(pairs);
  if (book.missing.size) throw new PayrollError("errors.missingRates", { pairs: [...book.missing].join(", ") });

  // Bonus exemption already used this year, from earlier runs' traces.
  const earlierSlips = await db.payslip.findMany({
    where: { run: { companyId: run.companyId, year: run.year, month: { lt: run.month } } },
    select: { employeeId: true, trace: true },
  });
  const ytdBonusExempt = new Map<string, number>();
  for (const s of earlierSlips) {
    const used = Number((s.trace as Record<string, number>)?.bonusExemptUsed ?? 0);
    ytdBonusExempt.set(s.employeeId, (ytdBonusExempt.get(s.employeeId) ?? 0) + used);
  }

  const skipped: { name: string; reason: string }[] = [];
  const results: Prisma.PayslipCreateInput[] = [];

  for (const e of employees) {
    const contract = e.contracts[0];
    const name = `${e.firstName} ${e.lastName}`;
    if (!contract) {
      skipped.push({ name, reason: "noContract" });
      continue;
    }
    const fraction = employedFraction(run.year, run.month, e.hireDate, e.terminationDate);
    if (fraction <= 0) continue;
    const input = inputs.find((i) => i.employeeId === e.id);
    const salaryCur = contract.salaryCurrency;
    const payCur = e.paymentCurrency ?? salaryCur;
    const conv: Conversion[] = [];
    const toCalc = (amount: number, cur: string, purpose: string) => book.convert(amount, cur, calcCur, purpose, conv);

    const components: ComponentInput[] = [
      ...e.components.map((a) => ({
        code: a.component.code,
        name: a.component.name,
        kind: a.component.kind,
        calcType: a.component.calcType,
        taxTreatment: a.component.taxTreatment,
        exemptLimit: a.component.exemptLimit,
        preTax: a.component.preTax,
        amount: a.component.calcType === "FIXED" ? toCalc(a.amount, a.currency ?? salaryCur, a.component.name) : 0,
        rateBp: a.rateBp,
      })),
      ...adjustments
        .filter((a) => a.employeeId === e.id)
        .map((a) => ({
          code: a.component.code,
          name: a.description || a.component.name,
          kind: a.component.kind,
          calcType: "FIXED" as const,
          taxTreatment: a.component.taxTreatment,
          exemptLimit: a.component.exemptLimit,
          preTax: a.component.preTax,
          amount: toCalc(a.amount, a.currency ?? salaryCur, a.description || a.component.name),
          rateBp: 0,
        })),
    ];

    const r = calculatePayslip(
      {
        payType: contract.payType,
        baseSalary: toCalc(contract.baseSalary, salaryCur, "BASE"),
        hourlyRate: toCalc(contract.hourlyRate, salaryCur, "HOURLY_RATE"),
        hoursPerWeek: contract.hoursPerWeek,
        pensionEmployeeBp: contract.pensionEmployeeBp,
        pensionEmployerBp: contract.pensionEmployerBp,
        numberOfChildren: e.numberOfChildren,
        employedFraction: fraction,
      },
      {
        hoursWorked: input?.hoursWorked ?? null,
        overtime1Hours: input?.overtime1Hours ?? 0,
        overtime2Hours: input?.overtime2Hours ?? 0,
        overtime1RateBp: run.company.overtimeRate1Bp,
        overtime2RateBp: run.company.overtimeRate2Bp,
        bonus: toCalc(input?.bonus ?? 0, salaryCur, "BONUS"),
        unpaidDays: input?.unpaidDays ?? 0,
        ytdBonusExemptUsed: ytdBonusExempt.get(e.id) ?? 0,
      },
      components,
      rules,
    );

    const netPayPayment = book.convert(r.netPay, calcCur, payCur, "NET_PAY", conv);
    const toBase = (v: number, purpose?: string) => book.convert(v, calcCur, baseCur, purpose ?? "", purpose ? conv : undefined);
    // Drop no-op conversions of zero amounts so the payslip only shows meaningful records.
    const conversions = conv.filter((c) => c.originalAmount !== 0 && c.from !== c.to);

    results.push({
      run: { connect: { id: run.id } },
      employee: { connect: { id: e.id } },
      employeeName: name,
      employeeNumber: e.employeeNumber,
      jobTitle: e.jobTitle,
      department: e.department?.name ?? null,
      bankName: e.bankName,
      bankAccount: e.bankAccount,
      grossPay: r.grossPay,
      taxableWage: r.taxableWage,
      wageTax: r.totalTax,
      aov: r.aov,
      totalDeductions: r.totalDeductions,
      netPay: r.netPay,
      employerCost: r.employerCost,
      calcCurrency: calcCur,
      salaryCurrency: salaryCur,
      paymentCurrency: payCur,
      netPayPayment,
      baseCurrency: baseCur,
      grossBase: toBase(r.grossPay, "REPORTING"),
      wageTaxBase: toBase(r.totalTax),
      aovBase: toBase(r.aov),
      netBase: toBase(r.netPay),
      employerCostBase: toBase(r.employerCost),
      conversions: conversions as unknown as Prisma.InputJsonValue,
      trace: { ...r.trace, bonusExemptUsed: r.bonusExemptUsed, pensionEmployer: r.pensionEmployer, ruleSet: ruleSet.name } as Prisma.InputJsonValue,
      lines: {
        create: r.lines.map((l, i) => ({
          sortOrder: i, type: l.type, code: l.code, description: l.description, quantity: l.quantity ?? null, rate: l.rate ?? null, amount: l.amount,
          ...(l.code === "BASE" && contract.payType === "MONTHLY" && salaryCur !== calcCur
            ? { originalAmount: Math.round(contract.baseSalary * fraction), originalCurrency: salaryCur }
            : {}),
        })),
      },
    });
  }

  const sum = (k: "grossBase" | "netBase" | "wageTaxBase" | "aovBase" | "employerCostBase") => results.reduce((s, r) => s + (r[k] as number), 0);

  await db.$transaction(async (tx) => {
    await tx.payslip.deleteMany({ where: { runId } });
    for (const data of results) await tx.payslip.create({ data });
    await tx.payrollRun.update({
      where: { id: runId },
      data: {
        status: "CALCULATED",
        calculatedAt: new Date(),
        taxRuleSetId: ruleSet.id,
        currency: baseCur,
        employeeCount: results.length,
        totalGross: sum("grossBase"),
        totalNet: sum("netBase"),
        totalWageTax: sum("wageTaxBase"),
        totalAov: sum("aovBase"),
        totalEmployer: sum("employerCostBase"),
      },
    });
  }, { timeout: 60_000 });

  return { count: results.length, skipped, ruleSetVerified: ruleSet.isVerified };
}
