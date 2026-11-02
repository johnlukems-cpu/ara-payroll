import "server-only";
import type { Prisma } from "@prisma/client";
import type { Locale } from "@/i18n/config";
import { COMPONENT_LIBRARY, libraryDefaults } from "@/lib/payroll/library";
import { DEFAULT_SCHEMES } from "@/lib/payroll/contributions";
import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";

/**
 * Default configuration for a new Surinamese company, named in the creator's language.
 * Everything is editable afterwards (names are company data, not interface text).
 */
export async function seedCompanyDefaults(tx: Prisma.TransactionClient, companyId: string, locale: Locale = "nl") {
  const d = (locale === "en" ? en : nl).defaults;
  const c = d.components as Record<string, string>;
  // Adopt every assignable entry of the central component library, plus the Surinamese child allowance.
  await tx.payComponent.createMany({
    data: [
      { companyId, code: "KB", name: c.KB, nameNl: nl.defaults.components.KB, nameEn: en.defaults.components.KB, kind: "ALLOWANCE", category: "ALLOWANCE", taxTreatment: "CHILD_ALLOWANCE", aovIncluded: false, legalStatus: "PENDING_VERIFICATION" },
      ...COMPONENT_LIBRARY.filter((e) => !e.isSystem).map((e) => ({
        companyId, code: e.code, libraryCode: e.code, name: locale === "en" ? e.nameEn : e.nameNl, nameNl: e.nameNl, nameEn: e.nameEn,
        kind: e.kind, category: e.category, legalReference: e.legalReference ?? null, ...libraryDefaults(e),
      })),
    ],
  });
  // Contribution schemes: inactive and without rates until an administrator configures them.
  const company = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { currency: true } });
  const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
  await tx.contributionScheme.createMany({
    data: DEFAULT_SCHEMES.map((s) => ({
      companyId, type: s.type, name: locale === "en" ? s.nameEn : s.nameNl, basis: s.basis, base: s.base, employeeTax: s.employeeTax,
      legalStatus: s.legalStatus, legalReference: s.legalReference, currency: company.currency, effectiveFrom: yearStart, isActive: false,
    })),
  });
  const l = d.leave as Record<string, string>;
  await tx.leaveType.createMany({
    data: [
      { companyId, code: "VAC", name: l.VAC, isPaid: true, annualEntitlementDays: 12, category: "ANNUAL", componentCode: "LEV001" },
      { companyId, code: "SICK", name: l.SICK, isPaid: true, annualEntitlementDays: 0, category: "SICK", componentCode: "LEV002" },
      { companyId, code: "MAT", name: l.MAT, isPaid: true, annualEntitlementDays: 0, category: "MATERNITY", componentCode: "LEV007", statutoryDays: 80, legalStatus: "PENDING_VERIFICATION", legalReference: "Wet Arbeidsbescherming Gezin, S.B. 2019 no. 64 — 16 weken (24 bij meerlingen van 3+)" },
      { companyId, code: "PAT", name: l.PAT, isPaid: true, annualEntitlementDays: 0, category: "PATERNITY", componentCode: "LEV008", statutoryDays: 8, legalStatus: "CONFLICT", legalReference: "Wet Arbeidsbescherming Gezin, S.B. 2019 no. 64 — duur volgens bronnen 5, 7 of 8 dagen" },
      { companyId, code: "ADO", name: l.ADO, isPaid: true, annualEntitlementDays: 0, category: "ADOPTION", componentCode: "LEV009", statutoryDays: 30, legalStatus: "PENDING_VERIFICATION", legalReference: "Wet Arbeidsbescherming Gezin, S.B. 2019 no. 64 — 6 weken (kind < 18 maanden)" },
      { companyId, code: "OUD", name: l.OUD, isPaid: true, annualEntitlementDays: 0, category: "PARENTAL", componentCode: "LEV006", allowPartTime: true, legalStatus: "COMPANY_POLICY", legalReference: "Geen afzonderlijke wettelijke regeling gevonden — bedrijfsbeleid" },
      { companyId, code: "CAL", name: l.CAL, isPaid: true, annualEntitlementDays: 0, category: "SPECIAL", componentCode: "LEV003" },
      { companyId, code: "FEEST", name: l.FEEST, isPaid: true, annualEntitlementDays: 0, category: "PUBLIC_HOLIDAY", componentCode: "LEV005" },
      { companyId, code: "UNP", name: l.UNP, isPaid: false, annualEntitlementDays: 0, category: "UNPAID", componentCode: "LEV004", payPercentBp: 0 },
      { companyId, code: "AZT", name: l.AZT, isPaid: false, annualEntitlementDays: 0, category: "UNAUTHORIZED", componentCode: "LEV010", payPercentBp: 0 },
    ],
  });
  await tx.department.createMany({ data: Object.values(d.departments).map((name) => ({ companyId, name })) });
}
