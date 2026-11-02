import type { AovRules, TaxRules } from "./engine";

const SRD = (v: number) => Math.round(v * 100);

/**
 * LEGACY starting values (first release). Kept only for history and for technical tests:
 * approved payroll calculated with them keeps referencing them. Superseded by SB_2024_2.
 * NOT a production benchmark — the separate heffingskorting is not part of the current law.
 */
export const DEFAULT_SR_RULES: TaxRules = {
  brackets: [
    { upTo: SRD(108_000), rateBp: 0 },
    { upTo: SRD(150_000), rateBp: 800 },
    { upTo: SRD(192_000), rateBp: 1800 },
    { upTo: SRD(234_000), rateBp: 2800 },
    { upTo: null, rateBp: 3800 },
  ],
  taxCreditMonthly: SRD(750),
  lumpSumRateBp: 400,
  lumpSumCapAnnual: SRD(4_800),
  aovRateBp: 400,
  aovFranchiseMonthly: SRD(400),
  overtimeBrackets: [
    { upTo: SRD(2_500), rateBp: 500 },
    { upTo: SRD(7_500), rateBp: 1500 },
    { upTo: null, rateBp: 2500 },
  ],
  childAllowanceExempt: SRD(125),
  childAllowanceMaxChildren: 4,
  bonusExemptAnnual: SRD(10_016),
};

export type Citation = { source: string; article: string; subject: string; status?: "VERIFIED" | "PENDING_VERIFICATION" | "CONFLICT" | "COMPANY_POLICY" };

/** Progressive annual brackets of Art. 14 (S.B. 2024 no. 2), applied to the taxable wage after the belastingvrije som. */
const ART14_BRACKETS = [
  { upTo: SRD(42_000), rateBp: 800 },
  { upTo: SRD(84_000), rateBp: 1800 },
  { upTo: SRD(126_000), rateBp: 2800 },
  { upTo: null, rateBp: 3800 },
];

/** Separate rate structure of Art. 17a lid 2 (S.B. 2024 no. 2). Scope NOT verified — never applied by default. */
const ART17A_BRACKETS = [
  { upTo: SRD(42_000), rateBp: 500 },
  { upTo: SRD(84_000), rateBp: 1500 },
  { upTo: SRD(126_000), rateBp: 2500 },
  { upTo: null, rateBp: 3500 },
];

/**
 * Loonbelasting per S.B. 2024 no. 2 (Staatsbesluit 11 januari 2024, in werking 1 januari 2024).
 * Pending verification for 2026: later decrees (S.B. 2025 no. 101, withdrawn by no. 129) may apply.
 */
export const SB_2024_2: { name: string; effectiveFrom: string; rules: TaxRules; citations: Citation[]; notes: string } = {
  name: "Loonbelasting S.B. 2024 no. 2 (art. 12, 13, 14)",
  effectiveFrom: "2024-01-01",
  rules: {
    brackets: ART14_BRACKETS,
    taxFreeAnnual: SRD(108_000),
    taxFreeMonthly: SRD(9_000),
    calcMethod: "ANNUALIZED",
    taxCreditMonthly: 0, // heffingskorting verwerkt in de belastingvrije som (S.B. 2022 no. 149)
    lumpSumMode: "FIXED",
    lumpSumRateBp: 0,
    lumpSumCapAnnual: SRD(4_800),
    lumpSumMonthly: SRD(400),
    aovRateBp: 400,
    aovFranchiseMonthly: 0,
    overtimeBrackets: [
      { upTo: SRD(2_500), rateBp: 500 },
      { upTo: SRD(7_500), rateBp: 1500 },
      { upTo: null, rateBp: 2500 },
    ],
    childAllowanceExempt: SRD(125),
    childAllowanceMaxChildren: 4,
    bonusExemptAnnual: SRD(10_016),
  },
  citations: [
    { source: "S.B. 2024 no. 2", article: "12", subject: "Beroepskostenaftrek SRD 4.800 per jaar (SRD 400 per maand)", status: "PENDING_VERIFICATION" },
    { source: "S.B. 2024 no. 2", article: "13", subject: "Belastingvrije som SRD 108.000 per jaar (SRD 9.000 per maand)", status: "PENDING_VERIFICATION" },
    { source: "S.B. 2024 no. 2", article: "14", subject: "Progressief tarief 8% / 18% / 28% / 38% (schijven van SRD 42.000)", status: "PENDING_VERIFICATION" },
    { source: "S.B. 2022 no. 149", article: "—", subject: "Geen afzonderlijke heffingskorting (verwerkt in de belastingvrije som)", status: "PENDING_VERIFICATION" },
    { source: "S.B. 2025 no. 101 / no. 129", article: "—", subject: "Overwerkschijven (5% tot SRD 2.500; 15% tot SRD 7.500; daarboven niet bevestigd) — no. 101 ingetrokken", status: "CONFLICT" },
    { source: "S.B. 2025 no. 101 / no. 129", article: "—", subject: "Vrijstelling bijzondere beloningen SRD 10.016 (vóór no. 101) of SRD 19.500 (no. 101, ingetrokken)", status: "CONFLICT" },
    { source: "—", article: "—", subject: "Vrijstelling kinderbijslag SRD 125 per kind (max. 4) — niet geverifieerd", status: "PENDING_VERIFICATION" },
  ],
  notes: "Primaire bron: S.B. 2024 no. 2. Niet automatisch geldig verklaard na de bevestigde geldigheidsperiode; controleer latere staatsbesluiten en instructies van de Belastingdienst vóór productiegebruik.",
};

export const SB_2024_2_ART17A = {
  name: "Afzonderlijk tarief art. 17a lid 2 (S.B. 2024 no. 2)",
  effectiveFrom: "2024-01-01",
  rules: { ...SB_2024_2.rules, brackets: ART17A_BRACKETS } as TaxRules,
  citations: [{ source: "S.B. 2024 no. 2", article: "17a lid 2", subject: "Tariefstructuur 5% / 15% / 25% / 35% — toepassingsbereik nog te verifiëren", status: "PENDING_VERIFICATION" }] as Citation[],
  notes: "Afzonderlijk regime. Wordt alleen toegepast op werknemers die uitdrukkelijk aan dit regime zijn gekoppeld, en pas nadat het toepassingsbereik is geverifieerd.",
};

/** AOV premium per Wet AOV as researched (see docs/LEGAL_RESEARCH.md). Pending verification. */
export const AOV_RESEARCH: { name: string; effectiveFrom: string; rules: AovRules; citations: Citation[]; notes: string } = {
  name: "AOV-premie (Wet AOV)",
  effectiveFrom: "2024-01-01",
  rules: { rateBp: 400, base: "TAXABLE_WAGE", franchiseMonthly: 0, minMonthly: null, maxMonthly: null, employeeShareBp: 10000, exemptFromAge: 60 },
  citations: [
    { source: "Wet AOV", article: "—", subject: "Premie 4% van de heffingsgrondslag", status: "PENDING_VERIFICATION" },
    { source: "Wet AOV", article: "—", subject: "Grondslag: zuiver loon (Wet Loonbelasting) indien loonbelasting verschuldigd is", status: "PENDING_VERIFICATION" },
    { source: "Wet AOV", article: "—", subject: "Premieplichtig tot de leeftijd van 60 jaar; heffing door inhouding op het loon (werknemerspremie)", status: "PENDING_VERIFICATION" },
    { source: "—", article: "—", subject: "Geen franchise gevonden", status: "PENDING_VERIFICATION" },
  ],
  notes: "Grondslag geïnterpreteerd als zuiver loon (na beroepskostenaftrek en aftrekbare pensioenpremie) plus overwerk en belaste bijzondere beloning. Professionele bevestiging vereist.",
};
