import { db } from "@/lib/db";
import { renderPayslipsPdf } from "@/lib/server/pdf";
import { notFound, withPermission } from "@/lib/server/route-auth";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return withPermission("payroll.view", async (ctx) => {
    const { id } = await params;
    const run = await db.payrollRun.findFirst({ where: { id, companyId: ctx.company.id }, include: { company: true, payslips: { include: { lines: { orderBy: { sortOrder: "asc" } } }, orderBy: { employeeName: "asc" } } } });
    if (!run) return notFound();
    const bytes = await renderPayslipsPdf(run.company, run, run.payslips);
    return new Response(Buffer.from(bytes), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="payslips-${run.year}-${String(run.month).padStart(2, "0")}.pdf"`, "Cache-Control": "no-store" },
    });
  });
}
