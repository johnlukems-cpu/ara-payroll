/** Generates the SQL upsert of the legal register (LegalSource) from src/lib/payroll/legal-sources.ts. */
import { LEGAL_SOURCES } from "../src/lib/payroll/legal-sources";

const q = (v: string | null | undefined) => (v == null ? "NULL" : `'${v.replace(/'/g, "''")}'`);
const j = (v: unknown) => `${q(JSON.stringify(v))}::jsonb`;
const d = (v?: string) => (v ? `'${v}'` : "NULL");
// Optional: LEGAL_CODES=A,B (only these sources) and LEGAL_CHECKED=YYYY-MM-DD (lastCheckedAt; history entries of that
// date only, so re-running for a later check appends the new history instead of duplicating the old entries).
const only = process.env.LEGAL_CODES?.split(",");
const checked = process.env.LEGAL_CHECKED ?? "2026-11-03";
const lines: string[] = [];
for (const s of LEGAL_SOURCES.filter((x) => !only || only.includes(x.code)).map((x) => (only ? { ...x, history: x.history.filter((h) => h.date === checked) } : x))) {
  lines.push(`INSERT INTO "LegalSource" ("code","title","publication","publishedAt","effectiveFrom","subject","articles","url","verificationStatus","notes","article","state","summary","lastAmendment","lastCheckedAt","components","evidence","history","updatedAt") VALUES (${q(s.code)},${q(s.title)},${q(s.publication)},${d(s.publishedAt)},${d(s.effectiveFrom)},${q(s.subject)},${j(s.articles)},${q(s.url)},'${s.verificationStatus}',${q(s.notes)},${q(s.article)},'${s.state}',${q(s.summary)},${q(s.lastAmendment)},'${checked}',${j(s.components)},${j(s.evidence)},${j(s.history)},NOW()) ON CONFLICT ("code") DO UPDATE SET "title"=EXCLUDED."title","publication"=EXCLUDED."publication","publishedAt"=EXCLUDED."publishedAt","effectiveFrom"=EXCLUDED."effectiveFrom","subject"=EXCLUDED."subject","articles"=EXCLUDED."articles","url"=EXCLUDED."url","verificationStatus"=EXCLUDED."verificationStatus","notes"=EXCLUDED."notes","article"=EXCLUDED."article","state"=EXCLUDED."state","summary"=EXCLUDED."summary","lastAmendment"=EXCLUDED."lastAmendment","lastCheckedAt"=EXCLUDED."lastCheckedAt","components"=EXCLUDED."components","evidence"=EXCLUDED."evidence","history"="LegalSource"."history" || EXCLUDED."history","updatedAt"=NOW();`);
}
console.log(lines.join("\n"));
