import "server-only";
import type { Prisma, TaxRuleSet } from "@prisma/client";
import { db } from "@/lib/db";
import { calculatePayslip, employedFraction, type Bracket, type ComponentInput, type TaxRules } from "./engine";

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

export class PayrollError extends Error {}

/** (Re)calculates all payslips for a run. Only DRAFT and CALCULATED runs can be calculated. */
export async function calculateRun(runId: string) {
  const run = await db.payrollRun.findUniqueOrThrow({ where: { id: runId }, include: { company: true } });
  if (run.status !== "DRAFT" && run.status !== "CALCULATED") throw new PayrollError("Approved or paid runs are locked and cannot be recalculated");

  const { start, end } = periodBounds(run.year, run.month);
  const ruleSet = await findRuleSet(run.companyId, end);
  if (!ruleSet) throw new PayrollError("No tax rule set is effective for this period. Configure one under Settings → Tax rules.");
  const rules = toRules(ruleSet);

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
      skipped.push({ name, reason: "No contract effective in this period" });
      continue;
    }
    const fraction = employedFraction(run.year, run.month, e.hireDate, e.terminationDate);
    if (fraction <= 0) continue;
    const input = inputs.find((i) => i.employeeId === e.id);
    const components: ComponentInput[] = [
      ...e.components.map((a) => ({
        code: a.component.code,
        name: a.component.name,
        kind: a.component.kind,
        calcType: a.component.calcType,
        taxTreatment: a.component.taxTreatment,
        exemptLimit: a.component.exemptLimit,
        preTax: a.component.preTax,
        amount: a.amount,
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
          amount: a.amount,
          rateBp: 0,
        })),
    ];

    const r = calculatePayslip(
      {
        payType: contract.payType,
        baseSalary: contract.baseSalary,
        hourlyRate: contract.hourlyRate,
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
        bonus: input?.bonus ?? 0,
        unpaidDays: input?.unpaidDays ?? 0,
        ytdBonusExemptUsed: ytdBonusExempt.get(e.id) ?? 0,
      },
      components,
      rules,
    );

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
      trace: { ...r.trace, bonusExemptUsed: r.bonusExemptUsed, pensionEmployer: r.pensionEmployer, ruleSet: ruleSet.name } as Prisma.InputJsonValue,
      lines: { create: r.lines.map((l, i) => ({ sortOrder: i, type: l.type, code: l.code, description: l.description, quantity: l.quantity ?? null, rate: l.rate ?? null, amount: l.amount })) },
    });
  }

  const sum = (k: "grossPay" | "netPay" | "wageTax" | "aov" | "employerCost") => results.reduce((s, r) => s + (r[k] as number), 0);

  await db.$transaction(async (tx) => {
    await tx.payslip.deleteMany({ where: { runId } });
    for (const data of results) await tx.payslip.create({ data });
    await tx.payrollRun.update({
      where: { id: runId },
      data: {
        status: "CALCULATED",
        calculatedAt: new Date(),
        taxRuleSetId: ruleSet.id,
        employeeCount: results.length,
        totalGross: sum("grossPay"),
        totalNet: sum("netPay"),
        totalWageTax: sum("wageTax"),
        totalAov: sum("aov"),
        totalEmployer: sum("employerCost"),
      },
    });
  }, { timeout: 60_000 });

  return { count: results.length, skipped, ruleSetVerified: ruleSet.isVerified };
}
