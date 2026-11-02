/**
 * Legal rules register — sources behind the statutory rules in ARA Payroll.
 * Status reflects what has been confirmed; nothing here replaces professional review.
 * Research notes: docs/LEGAL_RESEARCH.md.
 */
export type LegalSourceEntry = {
  code: string;
  title: string;
  publication: string;
  publishedAt?: string;
  effectiveFrom?: string;
  subject: string;
  articles: { article: string; summary: string }[];
  url?: string;
  verificationStatus: "VERIFIED" | "PENDING_VERIFICATION" | "CONFLICT" | "COMPANY_POLICY";
  notes?: string;
};

export const LEGAL_SOURCES: LegalSourceEntry[] = [
  {
    code: "WLB-1981",
    title: "Wet Loonbelasting",
    publication: "S.B. 1981 no. 181 (geldende tekst S.B. 1985 no. 10, zoals laatstelijk gewijzigd)",
    subject: "Loonbelasting — basiswet (inhoudingsplicht werkgever, zuiver loon, belastbaar loon, tarieven, art. 18a delegatie)",
    articles: [
      { article: "6", summary: "Werkgever is inhoudingsplichtige" },
      { article: "18a", summary: "Bedragen en percentages van o.a. art. 10, 12, 13, 14, 17 en 17c kunnen bij staatsbesluit worden gewijzigd" },
    ],
    url: "https://belastingdienst.sr/wp-content/uploads/2024/10/Wet-Loonbelasting.pdf",
    verificationStatus: "PENDING_VERIFICATION",
  },
  {
    code: "SB-2022-149",
    title: "Wet van 30 december 2022 houdende nadere wijziging van de Wet Loonbelasting",
    publication: "S.B. 2022 no. 149",
    publishedAt: "2022-12-30",
    subject: "Verwerking van de heffingskorting in de belastingvrije som",
    articles: [{ article: "—", summary: "Heffingskorting opgenomen in de belastingvrije som (geen afzonderlijke heffingskorting meer)" }],
    url: "https://www.sris.sr/wp-content/uploads/2023/01/S.B.-2022-no.-149-wijziging-van-de-Wet-Loonbelasting.pdf",
    verificationStatus: "PENDING_VERIFICATION",
    notes: "Inhoud alleen via secundaire samenvatting bevestigd; volledige tekst nalezen.",
  },
  {
    code: "SB-2024-2",
    title: "Staatsbesluit ter uitvoering van artikel 18a van de Wet Loonbelasting",
    publication: "S.B. 2024 no. 2",
    publishedAt: "2024-01-11",
    effectiveFrom: "2024-01-01",
    subject: "Beroepskostenaftrek, belastingvrije som en tariefschijven loonbelasting",
    articles: [
      { article: "12", summary: "Beroepskostenaftrek SRD 4.800 per jaar (SRD 400 per maand)" },
      { article: "13", summary: "Belastingvrije som SRD 108.000 per jaar (SRD 9.000 per maand)" },
      { article: "14", summary: "Tarief: 8% tot SRD 42.000; 18% tot SRD 84.000; 28% tot SRD 126.000; 38% daarboven" },
      { article: "17a lid 2", summary: "Afzonderlijke tariefstructuur: 5% / 15% / 25% / 35% (zelfde schijfgrenzen). Toepassingsbereik nog te verifiëren" },
    ],
    url: "https://www.sris.sr/wp-content/uploads/2024/01/S.B.-2024-no.-2-STAATSBESLUIT-11-januari-2024-uitvoeringartikel-18a-Wet-Loonbelasting-S.B.-1981-no.-181-laatstelijk-gewijzigd-S.B.pdf",
    verificationStatus: "PENDING_VERIFICATION",
    notes: "Primaire bron aangeleverd door ARA Intelligent Solutions. Nagaan of latere staatsbesluiten (o.a. S.B. 2025 no. 101 en no. 129) deze bepalingen hebben gewijzigd vóór productiegebruik in 2026.",
  },
  {
    code: "SB-2025-101",
    title: "Staatsbesluit van 22 juli 2025 ter uitvoering van artikel 18a van de Wet Loonbelasting",
    publication: "S.B. 2025 no. 101",
    publishedAt: "2025-07-22",
    subject: "Vrijstelling bijzondere beloningen (SRD 10.016 → SRD 19.500 per jaar) en verbreding overwerkschijven (5% tot SRD 2.500; 15% tot SRD 7.500)",
    articles: [{ article: "—", summary: "Volgens secundaire bronnen terugwerkend tot 1 jan. 2025 (bonus) resp. 1 juli 2025 (overwerk)" }],
    url: "https://www.sris.sr/wp-content/uploads/2025/07/S.B.-2025-no.-101-STAATSBESLUIT-van-22-juli-2025-ter-uitvoering-van-artikel-18a-van-de-Wet-Loonbelasting.pdf",
    verificationStatus: "CONFLICT",
    notes: "Volgens S.B. 2025 no. 129 (29 okt. 2025) ingetrokken. Inhoud van no. 129 niet beschikbaar — professionele beoordeling vereist.",
  },
  {
    code: "SB-2025-129",
    title: "Staatsbesluit ter uitvoering van artikel 18a van de Wet Loonbelasting",
    publication: "S.B. 2025 no. 129",
    publishedAt: "2025-10-29",
    subject: "Trekt S.B. 2025 no. 101 in; overige inhoud niet geverifieerd",
    articles: [],
    url: "https://www.sris.sr/wp-content/uploads/2025/11/S.B.-2025-no.-129-STAATSBESLUIT-ter-uitvoering-van-artikel-18a-van-de-Wet-Loonbelasting.pdf",
    verificationStatus: "CONFLICT",
  },
  {
    code: "WET-AOV",
    title: "Wet Algemene Oudedagsvoorziening",
    publication: "Wet AOV (zoals gewijzigd)",
    subject: "AOV-premie",
    articles: [
      { article: "—", summary: "Premie 4% van de heffingsgrondslag" },
      { article: "—", summary: "Grondslag: zuiver inkomen (IB 1922) of, als loonbelasting verschuldigd is, het zuiver loon (Wet Loonbelasting)" },
      { article: "—", summary: "Premieplichtig: ingezetene die de leeftijd van 60 jaar nog niet heeft bereikt; heffing o.a. door inhouding op het loon" },
    ],
    url: "https://belastingdienst.sr/wp-content/uploads/2024/10/Wet-AOV.pdf",
    verificationStatus: "PENDING_VERIFICATION",
    notes: "Geen franchise gevonden. Aangifte loonbelasting en premie AOV is één gecombineerde maandaangifte (online portaal sinds 2024).",
  },
  {
    code: "SB-2019-64",
    title: "Wet Arbeidsbescherming Gezin (bescherming moederschap)",
    publication: "S.B. 2019 no. 64",
    publishedAt: "2019-06-10",
    subject: "Zwangerschaps- en bevallingsverlof, vaderschapsverlof, adoptieverlof",
    articles: [
      { article: "—", summary: "Zwangerschaps- en bevallingsverlof samen max. 16 weken (24 weken bij meerlingen van drie of meer); 4–6 weken vóór en 10–12 weken na de bevalling" },
      { article: "—", summary: "Adoptie van een kind jonger dan 18 maanden: 6 weken betaald verlof voor de adoptiemoeder" },
      { article: "—", summary: "Vaderschapsverlof: duur volgens bronnen 5, 7 of 8 dagen (conflict)" },
      { article: "—", summary: "Loondoorbetaling via fonds (FVO); bijdrage volgens berichtgeving 1% van het brutoloon — niet geverifieerd" },
    ],
    url: "https://gov.sr/wp-content/uploads/2022/09/wet-arbeidsbescherming-gezin-bescherming-moederschap.pdf",
    verificationStatus: "PENDING_VERIFICATION",
  },
];
