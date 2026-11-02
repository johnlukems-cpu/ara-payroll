/** Generates SQL INSERTs for the component library and legal register (used to build the migration). */
import { COMPONENT_LIBRARY, libraryDefaults } from "../src/lib/payroll/library";
import { LEGAL_SOURCES } from "../src/lib/payroll/legal-sources";

const q = (v: string | null | undefined) => (v == null ? "NULL" : `'${v.replace(/'/g, "''")}'`);
const lines: string[] = [];
COMPONENT_LIBRARY.forEach((e, i) => {
  const d = libraryDefaults(e);
  lines.push(`INSERT INTO "ComponentLibrary" ("code","category","kind","nameNl","nameEn","calcType","taxTreatment","multiplierBp","aovIncluded","pensionIncluded","netEffect","employerCost","preTax","frequency","isSystem","systemCode","legalStatus","legalReference","sortOrder") VALUES (${q(e.code)},'${e.category}','${e.kind}',${q(e.nameNl)},${q(e.nameEn)},'${d.calcType}','${d.taxTreatment}',${d.multiplierBp},${d.aovIncluded},${d.pensionIncluded},'${d.netEffect}',${d.employerCost},${d.preTax},'${d.frequency}',${!!e.isSystem},${q(e.systemCode)},'${d.legalStatus}',${q(e.legalReference)},${i}) ON CONFLICT ("code") DO NOTHING;`);
});
for (const s of LEGAL_SOURCES) {
  lines.push(`INSERT INTO "LegalSource" ("code","title","publication","publishedAt","effectiveFrom","subject","articles","url","verificationStatus","notes","updatedAt") VALUES (${q(s.code)},${q(s.title)},${q(s.publication)},${s.publishedAt ? `'${s.publishedAt}'` : "NULL"},${s.effectiveFrom ? `'${s.effectiveFrom}'` : "NULL"},${q(s.subject)},${q(JSON.stringify(s.articles))}::jsonb,${q(s.url)},'${s.verificationStatus}',${q(s.notes)},NOW()) ON CONFLICT ("code") DO NOTHING;`);
}
console.log(lines.join("\n"));
