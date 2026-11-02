import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { db } from "@/lib/db";
import { requireSelf } from "@/lib/server/self-service";
import { getI18n } from "@/lib/server/i18n";
import { buttonVariants } from "@/components/ui/button";
import { PayslipView } from "@/components/payslip-view";
import { PayslipBreakdown } from "@/components/payslip-breakdown";
import { PrintButton } from "@/components/print-button";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("payslip.title") };
}

export default async function MyPayslip({ params }: { params: Promise<{ id: string }> }) {
  const { employee } = await requireSelf();
  const { t } = await getI18n();
  const { id } = await params;
  if (!employee) notFound();
  const slip = await db.payslip.findFirst({ where: { id, employeeId: employee.id, run: { status: { in: ["APPROVED", "PAID"] } } }, include: { lines: { orderBy: { sortOrder: "asc" } }, run: { include: { company: true } } } });
  if (!slip) notFound();
  return (
    <div>
      <div className="no-print mb-6 flex justify-end gap-2"><PrintButton /><a href={`/api/payslips/${slip.id}/pdf`} className={buttonVariants()}><Download /> {t("common.downloadPdf")}</a></div>
      <PayslipView slip={slip} />
      <PayslipBreakdown slip={slip} />
    </div>
  );
}
