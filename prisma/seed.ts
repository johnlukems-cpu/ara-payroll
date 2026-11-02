/**
 * Seed script.
 *   npm run db:seed          → ensures the platform default tax rule set exists (idempotent, safe in production)
 *   npm run db:seed -- --demo → also creates a demo organisation with users, employees and payroll history
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_SR_RULES } from "../src/lib/payroll/defaults";
import { seedCompanyDefaults } from "../src/lib/server/company-setup";
import { calculateRun } from "../src/lib/payroll/service";

const db = new PrismaClient();
const SRD = (v: number) => Math.round(v * 100);

async function ensureDefaultRules() {
  const name = "Suriname statutory defaults 2026";
  const exists = await db.taxRuleSet.findFirst({ where: { companyId: null, name } });
  if (exists) return exists;
  return db.taxRuleSet.create({
    data: {
      name,
      companyId: null,
      effectiveFrom: new Date("2024-01-01T00:00:00Z"),
      ...DEFAULT_SR_RULES,
      brackets: DEFAULT_SR_RULES.brackets as unknown as Prisma.InputJsonValue,
      overtimeBrackets: DEFAULT_SR_RULES.overtimeBrackets as unknown as Prisma.InputJsonValue,
      isVerified: false,
      notes: "Starting values shipped with ARA Payroll. Verify against current Belastingdienst Suriname publications before production use.",
    },
  });
}

const FIRST = ["Rajesh", "Sharmila", "Kenneth", "Marisa", "Djoko", "Sitie", "Roy", "Anjali", "Glenn", "Priscilla", "Wong", "Naomi", "Ravi", "Joyce"];
const LAST = ["Ramdin", "Biharie", "Pinas", "Wijngaarde", "Kartodikromo", "Soekhai", "Aloema", "Mahabier", "Tjon A Fong", "Bouterse", "Liang", "Sabajo", "Jairam", "Kromodimedjo"];
const JOBS = [["Administration", "Financial controller", 32000], ["Administration", "Payroll officer", 18500], ["Administration", "Receptionist", 9500], ["Operations", "Operations manager", 28000], ["Operations", "Warehouse supervisor", 15000], ["Operations", "Driver", 10500], ["Operations", "Technician", 13500], ["Sales", "Sales manager", 26000], ["Sales", "Account executive", 16000], ["Sales", "Sales associate", 11000]] as const;
const BANKS = ["De Surinaamsche Bank (DSB)", "Hakrinbank", "Finabank", "Republic Bank Suriname"];

async function demo() {
  const email = "owner@demo.ara.sr";
  if (await db.user.findUnique({ where: { email } })) {
    console.log("Demo data already present.");
    return;
  }
  const hash = await bcrypt.hash("Demo12345!", 12);
  const org = await db.organization.create({ data: { name: "Demo Holding N.V." } });
  const company = await db.company.create({
    data: {
      organizationId: org.id, name: "Paramaribo Trading N.V.", legalName: "Paramaribo Trading N.V.", kkfNumber: "45123", taxNumber: "1000123456",
      address: "Domineestraat 12", district: "Paramaribo", phone: "+597 471 000", email: "info@pbo-trading.sr",
      bankName: "De Surinaamsche Bank (DSB)", bankAccount: "1234567890",
    },
  });
  await db.$transaction((tx) => seedCompanyDefaults(tx, company.id, "nl"));
  const second = await db.company.create({ data: { organizationId: org.id, name: "Nickerie Agro B.V.", district: "Nickerie" } });
  await db.$transaction((tx) => seedCompanyDefaults(tx, second.id, "nl"));

  const owner = await db.user.create({ data: { email, name: "Demo Owner", passwordHash: hash, isPlatformAdmin: true } });
  const payroll = await db.user.create({ data: { email: "payroll@demo.ara.sr", name: "Petra Payroll", passwordHash: hash } });
  const accountant = await db.user.create({ data: { email: "accountant@demo.ara.sr", name: "Andre Accountant", passwordHash: hash, locale: "en" } });
  const empUser = await db.user.create({ data: { email: "employee@demo.ara.sr", name: "Rajesh Ramdin", passwordHash: hash } });
  await db.membership.createMany({
    data: [
      { userId: owner.id, companyId: company.id, role: "OWNER" },
      { userId: owner.id, companyId: second.id, role: "OWNER" },
      { userId: payroll.id, companyId: company.id, role: "PAYROLL_MANAGER" },
      { userId: accountant.id, companyId: company.id, role: "ACCOUNTANT" },
      { userId: empUser.id, companyId: company.id, role: "EMPLOYEE" },
    ],
  });

  const depts = await db.department.findMany({ where: { companyId: company.id } });
  const comps = await db.payComponent.findMany({ where: { companyId: company.id } });
  const comp = (code: string) => comps.find((c) => c.code === code)!;
  const year = new Date().getUTCFullYear();

  for (let i = 0; i < 14; i++) {
    const [dept, job, salary] = JOBS[i % JOBS.length];
    const hourly = i === 12 || i === 13;
    const hire = new Date(Date.UTC(year - 1 - (i % 4), (i * 5) % 12, 1 + (i % 20)));
    const e = await db.employee.create({
      data: {
        companyId: company.id, employeeNumber: String(1001 + i), firstName: FIRST[i], lastName: LAST[i],
        userId: i === 0 ? empUser.id : null, email: i === 0 ? empUser.email : `${FIRST[i].toLowerCase()}@example.sr`,
        idNumber: `FB${100000 + i * 731}`, dateOfBirth: new Date(Date.UTC(1975 + i, i % 12, 10)), gender: i % 2 ? "Female" : "Male",
        maritalStatus: i % 3 ? "Married" : "Single", numberOfChildren: i % 4, phone: `+597 8${String(500000 + i * 1234)}`,
        district: ["Paramaribo", "Wanica", "Commewijne", "Para"][i % 4], address: `${["Kernkampweg", "Indira Gandhiweg", "Verlengde Gemenelandsweg", "Tourtonnelaan"][i % 4]} ${10 + i}`,
        bankName: BANKS[i % BANKS.length], bankAccount: String(2000000000 + i * 1357), departmentId: depts.find((d) => d.name === dept)?.id,
        jobTitle: hourly ? "Production worker" : job, hireDate: hire,
        contracts: { create: hourly
          ? { contractType: "TEMPORARY", payType: "HOURLY", startDate: hire, hourlyRate: SRD(55), hoursPerWeek: 40 }
          : { contractType: "PERMANENT", payType: "MONTHLY", startDate: hire, baseSalary: SRD(salary), hoursPerWeek: 40, pensionEmployeeBp: 300, pensionEmployerBp: 500 } },
      },
    });
    const start = new Date(Date.UTC(year - 1, 0, 1));
    const assigns: Prisma.EmployeePayComponentCreateManyInput[] = [{ employeeId: e.id, componentId: comp("TRANS").id, amount: SRD(600), currency: "SRD", startDate: start }];
    if (e.numberOfChildren > 0) assigns.push({ employeeId: e.id, componentId: comp("KB").id, amount: SRD(125 * e.numberOfChildren), currency: "SRD", startDate: start });
    if (!hourly) assigns.push({ employeeId: e.id, componentId: comp("BZV").id, amount: SRD(350), currency: "SRD", startDate: start });
    if (i % 5 === 0) assigns.push({ employeeId: e.id, componentId: comp("LOAN").id, amount: SRD(500), currency: "SRD", startDate: start });
    await db.employeePayComponent.createMany({ data: assigns });
  }

  // Payroll history: Jan → previous month approved/paid, current month draft.
  const thisMonth = new Date().getUTCMonth() + 1;
  const employees = await db.employee.findMany({ where: { companyId: company.id } });
  for (let m = 1; m <= thisMonth; m++) {
    const run = await db.payrollRun.create({ data: { companyId: company.id, year, month: m, payDate: new Date(Date.UTC(year, m - 1, 25)), createdById: payroll.id } });
    await db.payrollInput.createMany({
      data: employees.map((e, idx) => ({
        runId: run.id, employeeId: e.id,
        hoursWorked: e.employeeNumber >= "1013" ? 168 + (m % 3) * 4 : null,
        overtime1Hours: idx % 3 === 0 ? 6 + (m % 4) : 0,
        overtime2Hours: idx % 7 === 0 ? 4 : 0,
        bonus: m === 12 || (m === 8 && idx % 2 === 0) ? SRD(5000) : 0,
      })),
    });
    await calculateRun(run.id);
    if (m < thisMonth) {
      await db.payrollRun.update({ where: { id: run.id }, data: { status: m < thisMonth - 1 ? "PAID" : "APPROVED", approvedById: owner.id, approvedAt: new Date(Date.UTC(year, m - 1, 22)), paidAt: m < thisMonth - 1 ? new Date(Date.UTC(year, m - 1, 25)) : null } });
    }
  }

  const vac = await db.leaveType.findFirst({ where: { companyId: company.id, code: "VAC" } });
  if (vac) {
    await db.leaveRequest.createMany({
      data: [
        { employeeId: employees[0].id, leaveTypeId: vac.id, startDate: new Date(Date.UTC(year, 2, 9)), endDate: new Date(Date.UTC(year, 2, 13)), days: 5, status: "APPROVED", decidedById: owner.id, decidedAt: new Date() },
        { employeeId: employees[1].id, leaveTypeId: vac.id, startDate: new Date(Date.UTC(year, 11, 21)), endDate: new Date(Date.UTC(year, 11, 24)), days: 4, reason: "Family visit", status: "PENDING" },
        { employeeId: employees[3].id, leaveTypeId: vac.id, startDate: new Date(Date.UTC(year, 10, 16)), endDate: new Date(Date.UTC(year, 10, 18)), days: 3, status: "PENDING" },
      ],
    });
  }
  console.log("Demo data created. Sign in with owner@demo.ara.sr / Demo12345! (also payroll@, accountant@, employee@demo.ara.sr)");
}

/**
 * Multicurrency demo (idempotent): approved USD/EUR→SRD rates and two employees moved to
 * foreign-currency contracts from the current month. Earlier (paid) payroll stays in SRD,
 * demonstrating that history keeps its original currency.
 */
async function demoMulticurrency() {
  const company = await db.company.findFirst({ where: { name: "Paramaribo Trading N.V." } });
  const owner = await db.user.findUnique({ where: { email: "owner@demo.ara.sr" } });
  if (!company || !owner) return;
  await db.user.update({ where: { id: owner.id }, data: { isPlatformAdmin: true } });
  if (await db.exchangeRate.count({ where: { companyId: company.id } })) {
    console.log("Multicurrency demo already present.");
    return;
  }
  const year = new Date().getUTCFullYear();
  const month = new Date().getUTCMonth() + 1;
  const approved = { status: "APPROVED" as const, source: "MANUAL" as const, createdById: owner.id, approvedById: owner.id, approvedAt: new Date() };
  await db.exchangeRate.createMany({
    data: [
      { companyId: company.id, baseCurrency: "USD", quoteCurrency: "SRD", rate: "36.2500000000", effectiveDate: new Date(Date.UTC(year, 0, 1)), notes: "CBvS (demo)", ...approved },
      { companyId: company.id, baseCurrency: "USD", quoteCurrency: "SRD", rate: "36.5000000000", effectiveDate: new Date(Date.UTC(year, month - 1, 1)), notes: "CBvS (demo)", ...approved },
      { companyId: company.id, baseCurrency: "EUR", quoteCurrency: "SRD", rate: "39.8000000000", effectiveDate: new Date(Date.UTC(year, month - 1, 1)), notes: "CBvS (demo)", ...approved },
      { companyId: null, baseCurrency: "USD", quoteCurrency: "GYD", rate: "209.0000000000", effectiveDate: new Date(Date.UTC(year, 0, 1)), notes: "Platform (demo)", ...approved },
      { companyId: company.id, baseCurrency: "USD", quoteCurrency: "SRD", rate: "36.6000000000", effectiveDate: new Date(Date.UTC(year, month - 1, 2)), notes: "Awaiting approval (demo)", status: "PENDING", source: "MANUAL", createdById: owner.id },
    ],
  });
  const start = new Date(Date.UTC(year, month - 1, 1));
  const usd = await db.employee.findFirst({ where: { companyId: company.id, employeeNumber: "1002" } });
  const eur = await db.employee.findFirst({ where: { companyId: company.id, employeeNumber: "1004" } });
  if (usd) {
    await db.contract.create({ data: { employeeId: usd.id, contractType: "PERMANENT", payType: "MONTHLY", salaryCurrency: "USD", baseSalary: SRD(1200), startDate: start, hoursPerWeek: 40, pensionEmployeeBp: 300, pensionEmployerBp: 500, notes: "USD contract (demo)" } });
    await db.employee.update({ where: { id: usd.id }, data: { paymentCurrency: "USD" } });
  }
  if (eur) {
    await db.contract.create({ data: { employeeId: eur.id, contractType: "PERMANENT", payType: "MONTHLY", salaryCurrency: "EUR", baseSalary: SRD(950), startDate: start, hoursPerWeek: 40, pensionEmployeeBp: 300, pensionEmployerBp: 500, notes: "EUR contract, paid in SRD (demo)" } });
    await db.employee.update({ where: { id: eur.id }, data: { paymentCurrency: "SRD" } });
  }
  const run = await db.payrollRun.findFirst({ where: { companyId: company.id, year, month, status: { in: ["DRAFT", "CALCULATED"] } } });
  if (run) await calculateRun(run.id);
  console.log("Multicurrency demo created (USD and EUR employees, approved rates).");
}

async function main() {
  await ensureDefaultRules();
  console.log("Platform default tax rule set ensured.");
  if (process.argv.includes("--demo")) {
    await demo();
    await demoMulticurrency();
  }
}

main().finally(() => db.$disconnect());
