import "server-only";
import type { Prisma } from "@prisma/client";

const SRD = (v: number) => Math.round(v * 100);

/** Default configuration for a new Surinamese company. Everything is editable afterwards. */
export async function seedCompanyDefaults(tx: Prisma.TransactionClient, companyId: string) {
  await tx.payComponent.createMany({
    data: [
      { companyId, code: "KB", name: "Child allowance (kinderbijslag)", kind: "ALLOWANCE", taxTreatment: "CHILD_ALLOWANCE" },
      { companyId, code: "TRANS", name: "Transport allowance", kind: "ALLOWANCE", taxTreatment: "TAXABLE" },
      { companyId, code: "HOUSE", name: "Housing allowance", kind: "ALLOWANCE", taxTreatment: "TAXABLE" },
      { companyId, code: "REPR", name: "Representation allowance", kind: "ALLOWANCE", taxTreatment: "EXEMPT_UP_TO_LIMIT", exemptLimit: SRD(0) },
      { companyId, code: "ADJ+", name: "Other allowance (one-off)", kind: "ALLOWANCE", taxTreatment: "TAXABLE" },
      { companyId, code: "BZV", name: "Health insurance (basiszorgverzekering)", kind: "DEDUCTION" },
      { companyId, code: "LOAN", name: "Loan repayment", kind: "DEDUCTION" },
      { companyId, code: "ADV", name: "Salary advance", kind: "DEDUCTION" },
      { companyId, code: "UNION", name: "Union dues", kind: "DEDUCTION" },
      { companyId, code: "ADJ-", name: "Other deduction (one-off)", kind: "DEDUCTION" },
    ],
  });
  await tx.leaveType.createMany({
    data: [
      { companyId, code: "VAC", name: "Annual leave (vakantie)", isPaid: true, annualEntitlementDays: 12 },
      { companyId, code: "SICK", name: "Sick leave", isPaid: true, annualEntitlementDays: 0 },
      { companyId, code: "MAT", name: "Maternity leave", isPaid: true, annualEntitlementDays: 0 },
      { companyId, code: "PAT", name: "Paternity leave", isPaid: true, annualEntitlementDays: 0 },
      { companyId, code: "CAL", name: "Special / calamity leave", isPaid: true, annualEntitlementDays: 0 },
      { companyId, code: "UNP", name: "Unpaid leave", isPaid: false, annualEntitlementDays: 0 },
    ],
  });
  await tx.department.createMany({
    data: ["Administration", "Operations", "Sales"].map((name) => ({ companyId, name })),
  });
}
