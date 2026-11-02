import { db } from "@/lib/db";
import { getContext } from "@/lib/server/auth";
import { can } from "@/lib/permissions";
import { renderPayslipsPdf } from "@/lib/server/pdf";
import { audit } from "@/lib/server/audit";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const slip = await db.payslip.findUnique({ where: { id }, include: { lines: { orderBy: { sortOrder: "asc" } }, employee: true, run: { include: { company: true } } } });
  if (!slip) return new Response("Not found", { status: 404 });
  const membership = ctx.memberships.find((m) => m.companyId === slip.run.companyId);
  const isStaff = membership && can(membership.role, "payroll.view");
  const isOwner = slip.employee.userId === ctx.user.id && (slip.run.status === "APPROVED" || slip.run.status === "PAID");
  if (!isStaff && !isOwner) return new Response("Not found", { status: 404 });
  const bytes = await renderPayslipsPdf(slip.run.company, slip.run, [slip]);
  await audit({ companyId: slip.run.companyId, userId: ctx.user.id, action: "payslip.download", entity: "Payslip", entityId: slip.id });
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="payslip-${slip.employeeNumber}-${slip.run.year}-${String(slip.run.month).padStart(2, "0")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
