import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { buttonVariants } from "@/components/ui/button";
import { PayslipView } from "@/components/payslip-view";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Payslip" };

export default async function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("payroll.view");
  const { id } = await params;
  const slip = await db.payslip.findFirst({ where: { id, run: { companyId: ctx.company.id } }, include: { lines: { orderBy: { sortOrder: "asc" } }, run: { include: { company: true } } } });
  if (!slip) notFound();
  return (
    <div>
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-2">
        <Link href={`/app/payroll/${slip.runId}`} className={buttonVariants({ variant: "ghost" })}><ArrowLeft /> Back to payroll run</Link>
        <div className="flex gap-2">
          <PrintButton />
          <a href={`/api/payslips/${slip.id}/pdf`} className={buttonVariants()}><Download /> Download PDF</a>
        </div>
      </div>
      <PayslipView slip={slip} />
    </div>
  );
}
