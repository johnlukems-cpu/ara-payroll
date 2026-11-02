import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { db } from "@/lib/db";
import { requireSelf } from "@/lib/server/self-service";
import { buttonVariants } from "@/components/ui/button";
import { PayslipView } from "@/components/payslip-view";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Payslip" };

export default async function MyPayslip({ params }: { params: Promise<{ id: string }> }) {
  const { employee } = await requireSelf();
  const { id } = await params;
  if (!employee) notFound();
  const slip = await db.payslip.findFirst({ where: { id, employeeId: employee.id, run: { status: { in: ["APPROVED", "PAID"] } } }, include: { lines: { orderBy: { sortOrder: "asc" } }, run: { include: { company: true } } } });
  if (!slip) notFound();
  return (
    <div>
      <div className="no-print mb-6 flex justify-end gap-2"><PrintButton /><a href={`/api/payslips/${slip.id}/pdf`} className={buttonVariants()}><Download /> Download PDF</a></div>
      <PayslipView slip={slip} />
    </div>
  );
}
