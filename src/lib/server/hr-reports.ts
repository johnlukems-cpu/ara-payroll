import "server-only";
import { db } from "@/lib/db";
import type { createFormat } from "@/lib/format";
import type { ExportTable } from "./table-export";

type T = (key: string, values?: Record<string, string | number>) => string;
type F = ReturnType<typeof createFormat>;
export const HR_REPORTS = ["roster", "departments", "movement", "contracts", "costs"] as const;
export type HrReport = (typeof HR_REPORTS)[number];
/** Reports that show salary amounts (only for roles that may see salaries). */
export const SALARY_REPORTS: HrReport[] = ["costs"];

const yearEnd = (y: number) => new Date(Date.UTC(y, 11, 31, 23, 59, 59));
const yearStart = (y: number) => new Date(Date.UTC(y, 0, 1));
const inYear = (d: Date | null, y: number) => !!d && d.getUTCFullYear() === y;

/** HR and financial report tables for one company, from real records only. */
export async function hrReport(kind: HrReport, company: { id: string; name: string; currency: string }, year: number, t: T, f: F): Promise<ExportTable> {
  const companyId = company.id;
  const sub = `${company.name} · ${year}`;
  if (kind === "roster" || kind === "departments" || kind === "movement" || kind === "contracts") {
    const emps = await db.employee.findMany({ where: { companyId }, include: { department: true, contracts: { orderBy: { startDate: "desc" } } }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] });
    if (kind === "roster") {
      const active = emps.filter((e) => e.hireDate <= yearEnd(year) && (!e.terminationDate || e.terminationDate >= yearStart(year)));
      return {
        title: t("hrReports.roster.title"), subtitle: sub, filename: `employees-${year}`,
        header: [t("csv.employeeNo"), t("csv.name"), t("employees.cols.department"), t("employees.cols.jobTitle"), t("employee.hireDate"), t("employee.terminationDate"), t("employees.cols.status"), t("hrReports.contractType"), t("employee.frequency"), t("employee.contract.salaryCurrency"), t("employee.paymentCurrency")],
        rows: active.map((e) => {
          const c = e.contracts[0];
          return [e.employeeNumber, `${e.lastName}, ${e.firstName}`, e.department?.name ?? "", e.jobTitle ?? "", f.date(e.hireDate), e.terminationDate ? f.date(e.terminationDate) : "", t(`status.${e.status}`), c ? t(`enums.contractType.${c.contractType}`) : "", c ? t(`enums.frequency.${c.payType}`) : "", c?.salaryCurrency ?? "", e.paymentCurrency ?? c?.salaryCurrency ?? ""];
        }),
      };
    }
    if (kind === "departments") {
      const groups = new Map<string, typeof emps>();
      for (const e of emps) groups.set(e.department?.name ?? t("reports.unassigned"), [...(groups.get(e.department?.name ?? t("reports.unassigned")) ?? []), e]);
      return {
        title: t("hrReports.departments.title"), subtitle: sub, filename: `employees-per-department-${year}`,
        header: [t("employees.cols.department"), t("hrReports.active"), t("status.ON_LEAVE"), t("hrReports.hires"), t("hrReports.leavers"), t("hrReports.headcountEnd")],
        rows: [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, list]) => [
          name, list.filter((e) => e.status === "ACTIVE").length, list.filter((e) => e.status === "ON_LEAVE").length,
          list.filter((e) => inYear(e.hireDate, year)).length, list.filter((e) => inYear(e.terminationDate, year)).length,
          list.filter((e) => e.hireDate <= yearEnd(year) && (!e.terminationDate || e.terminationDate > yearEnd(year))).length,
        ]),
      };
    }
    if (kind === "movement") {
      return {
        title: t("hrReports.movement.title"), subtitle: sub, filename: `inflow-outflow-${year}`,
        header: [t("csv.month"), t("hrReports.hires"), t("hrReports.leavers"), t("hrReports.headcountEnd")],
        rows: Array.from({ length: 12 }, (_, i) => {
          const end = new Date(Date.UTC(year, i + 1, 0, 23, 59, 59));
          const m = (d: Date | null) => !!d && d.getUTCFullYear() === year && d.getUTCMonth() === i;
          return [f.month(i + 1), emps.filter((e) => m(e.hireDate)).length, emps.filter((e) => m(e.terminationDate)).length, emps.filter((e) => e.hireDate <= end && (!e.terminationDate || e.terminationDate > end)).length];
        }),
      };
    }
    const now = new Date();
    return {
      title: t("hrReports.contracts.title"), subtitle: company.name, filename: "contracts",
      header: [t("csv.employeeNo"), t("csv.name"), t("hrReports.contractType"), t("hrReports.start"), t("hrReports.end"), t("hrReports.daysLeft"), t("employee.frequency")],
      rows: emps.filter((e) => e.status !== "TERMINATED" && e.contracts[0]).map((e) => {
        const c = e.contracts[0];
        return [e.employeeNumber, `${e.lastName}, ${e.firstName}`, t(`enums.contractType.${c.contractType}`), f.date(c.startDate), c.endDate ? f.date(c.endDate) : t("hrReports.noEnd"), c.endDate ? Math.ceil((c.endDate.getTime() - now.getTime()) / 86_400_000) : "", t(`enums.frequency.${c.payType}`)];
      }).sort((a, b) => (typeof a[5] === "number" ? a[5] : 1e9) - (typeof b[5] === "number" ? b[5] : 1e9)),
    };
  }
  // costs: wage costs per employee (employerCost already includes gross pay) from approved/paid payslips, in the company's reporting (base) currency.
  const slips = await db.payslip.findMany({ where: { run: { companyId, year, status: { in: ["APPROVED", "PAID"] } } }, select: { employeeId: true, employeeNumber: true, employeeName: true, department: true, baseCurrency: true, grossBase: true, netBase: true, wageTaxBase: true, aovBase: true, employerCostBase: true } });
  const per = new Map<string, { number: string; name: string; dept: string; cur: string; months: number; gross: number; net: number; tax: number; aov: number; employer: number }>();
  for (const s of slips) {
    const k = `${s.employeeId}|${s.baseCurrency}`;
    const r = per.get(k) ?? { number: s.employeeNumber, name: s.employeeName, dept: s.department ?? "", cur: s.baseCurrency, months: 0, gross: 0, net: 0, tax: 0, aov: 0, employer: 0 };
    r.months++; r.gross += s.grossBase; r.net += s.netBase; r.tax += s.wageTaxBase; r.aov += s.aovBase; r.employer += s.employerCostBase;
    per.set(k, r);
  }
  return {
    title: t("hrReports.costs.title"), subtitle: `${sub} · ${t("hrReports.costs.basis")}`, filename: `wage-costs-per-employee-${year}`, moneyCols: [5, 6, 7, 8, 9, 10],
    header: [t("csv.employeeNo"), t("csv.name"), t("employees.cols.department"), t("csv.currency"), t("csv.months"), t("csv.grossWages"), t("csv.wageTaxLb"), t("csv.aovPremium"), t("hrReports.net"), t("hrReports.employerCharges"), t("hrReports.totalCost")],
    rows: [...per.values()].sort((a, b) => a.name.localeCompare(b.name)).map((r) => [r.number, r.name, r.dept, r.cur, r.months, r.gross, r.tax, r.aov, r.net, r.employer - r.gross, r.employer]),
  };
}
