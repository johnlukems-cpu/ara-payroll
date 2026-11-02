/** Recalculates all DRAFT/CALCULATED payroll runs (approved and paid runs are never touched). Usage: npm run payroll:recalc */
import { PrismaClient } from "@prisma/client";
import { calculateRun } from "../src/lib/payroll/service";

const db = new PrismaClient();

async function main() {
  const runs = await db.payrollRun.findMany({ where: { status: { in: ["DRAFT", "CALCULATED"] } }, include: { company: true } });
  for (const run of runs) {
    try {
      const r = await calculateRun(run.id);
      console.log(`${run.company.name} ${run.year}-${run.month}: ${r.count} payslips`);
    } catch (e) {
      console.error(`${run.company.name} ${run.year}-${run.month}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

main().finally(() => db.$disconnect());
