import "server-only";
import type { Prisma } from "@prisma/client";
import type { Locale } from "@/i18n/config";
import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";

/**
 * Default configuration for a new Surinamese company, named in the creator's language.
 * Everything is editable afterwards (names are company data, not interface text).
 */
export async function seedCompanyDefaults(tx: Prisma.TransactionClient, companyId: string, locale: Locale = "nl") {
  const d = (locale === "en" ? en : nl).defaults;
  const c = d.components as Record<string, string>;
  await tx.payComponent.createMany({
    data: [
      { companyId, code: "KB", name: c.KB, kind: "ALLOWANCE", taxTreatment: "CHILD_ALLOWANCE" },
      { companyId, code: "TRANS", name: c.TRANS, kind: "ALLOWANCE", taxTreatment: "TAXABLE" },
      { companyId, code: "HOUSE", name: c.HOUSE, kind: "ALLOWANCE", taxTreatment: "TAXABLE" },
      { companyId, code: "REPR", name: c.REPR, kind: "ALLOWANCE", taxTreatment: "EXEMPT_UP_TO_LIMIT", exemptLimit: 0 },
      { companyId, code: "ADJ+", name: c["ADJ+"], kind: "ALLOWANCE", taxTreatment: "TAXABLE" },
      { companyId, code: "BZV", name: c.BZV, kind: "DEDUCTION" },
      { companyId, code: "LOAN", name: c.LOAN, kind: "DEDUCTION" },
      { companyId, code: "ADV", name: c.ADV, kind: "DEDUCTION" },
      { companyId, code: "UNION", name: c.UNION, kind: "DEDUCTION" },
      { companyId, code: "ADJ-", name: c["ADJ-"], kind: "DEDUCTION" },
    ],
  });
  const l = d.leave as Record<string, string>;
  await tx.leaveType.createMany({
    data: [
      { companyId, code: "VAC", name: l.VAC, isPaid: true, annualEntitlementDays: 12 },
      { companyId, code: "SICK", name: l.SICK, isPaid: true, annualEntitlementDays: 0 },
      { companyId, code: "MAT", name: l.MAT, isPaid: true, annualEntitlementDays: 0 },
      { companyId, code: "PAT", name: l.PAT, isPaid: true, annualEntitlementDays: 0 },
      { companyId, code: "CAL", name: l.CAL, isPaid: true, annualEntitlementDays: 0 },
      { companyId, code: "UNP", name: l.UNP, isPaid: false, annualEntitlementDays: 0 },
    ],
  });
  await tx.department.createMany({ data: Object.values(d.departments).map((name) => ({ companyId, name })) });
}
