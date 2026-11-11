/**
 * Legal rules register — the sources behind the statutory rules in ARA Payroll.
 *
 * Verification status:
 *  - VERIFIED            the full official text was reviewed (by an authorised reviewer)
 *  - PARTIALLY_VERIFIED  official publications (government, fund or Staatsblad excerpts) agree, but the full
 *                        primary text could not be reviewed — NOT sufficient to activate statutory settings
 *  - PENDING_VERIFICATION / CONFLICT  not (yet) confirmed, or sources contradict each other
 *
 * Research of 3 November 2026: official sites (gov.sr, sris.sr, dna.sr, belastingdienst.sr, fvo.sr) could not be
 * opened from the research environment; findings come from search-engine excerpts of those official pages and from
 * secondary sources. That is why nothing below is marked VERIFIED. Earlier statements are kept in `history`.
 * Research notes: docs/LEGAL_RESEARCH.md.
 */
export type Evidence = { source: string; url: string; kind: "OFFICIAL_TEXT" | "OFFICIAL_EXCERPT" | "SECONDARY"; finding: string; checkedAt: string };
export type HistoryEntry = { date: string; previous: string; current: string; reason: string };

export type LegalSourceEntry = {
  code: string;
  title: string;
  publication: string;
  publishedAt?: string;
  effectiveFrom?: string;
  subject: string;
  article?: string;
  summary?: string;
  lastAmendment?: string;
  state: "IN_FORCE" | "AMENDED" | "REPEALED" | "TO_VERIFY";
  articles: { article: string; summary: string }[];
  url?: string;
  verificationStatus: "VERIFIED" | "PARTIALLY_VERIFIED" | "PENDING_VERIFICATION" | "CONFLICT" | "COMPANY_POLICY";
  notes?: string;
  components: string[];
  evidence: Evidence[];
  history: HistoryEntry[];
};

const CHECKED = "2026-11-03";
/** Second check against the primary texts (DNA Staatsblad PDFs, FVO), 11 November 2026. */
const VERIFIED_AT = "2026-11-11";

export const LEGAL_SOURCES: LegalSourceEntry[] = [
  {
    code: "WLB-1981",
    title: "Wet Loonbelasting",
    publication: "S.B. 1981 no. 181 (geldende tekst S.B. 1985 no. 10, zoals laatstelijk gewijzigd)",
    subject: "Loonbelasting — basiswet (inhoudingsplicht werkgever, zuiver loon, belastbaar loon, tarieven, art. 18a delegatie)",
    article: "art. 6, 10, 12, 13, 14, 17, 17a, 18a",
    state: "AMENDED",
    lastAmendment: "S.B. 2025 no. 129 (staatsbesluit ter uitvoering van art. 18a)",
    summary: "De werkgever houdt loonbelasting in en draagt af. Bedragen en percentages (o.a. art. 10, 12, 13, 14, 17 en 17c) worden bij staatsbesluit op grond van art. 18a vastgesteld.",
    articles: [
      { article: "6", summary: "Werkgever is inhoudingsplichtige" },
      { article: "18a", summary: "Bedragen en percentages van o.a. art. 10, 12, 13, 14, 17 en 17c kunnen bij staatsbesluit worden gewijzigd" },
    ],
    url: "https://www.sris.sr/wp-content/uploads/2018/01/Wet-Loonbelasting.pdf",
    verificationStatus: "PENDING_VERIFICATION",
    components: ["Loonbelasting (LB)", "Beroepskostenaftrek", "Belastingvrije som", "Tariefschijven", "Overwerk (LB-OT)", "Bijzondere beloningen (LB-BB)", "Kinderbijslag (vrijstelling)"],
    evidence: [
      { source: "SRIS — Wet Loonbelasting (geconsolideerde tekst)", url: "https://www.sris.sr/wp-content/uploads/2018/01/Wet-Loonbelasting.pdf", kind: "OFFICIAL_EXCERPT", finding: "Basiswet beschikbaar; volledige tekst niet ingezien vanuit de onderzoeksomgeving.", checkedAt: CHECKED },
    ],
    history: [
      { date: CHECKED, previous: "URL belastingdienst.sr/…/Wet-Loonbelasting.pdf", current: "URL sris.sr/…/Wet-Loonbelasting.pdf", reason: "Stichting Rechtsorde Suriname (SRIS) publiceert de Staatsbladen; beide links verwijzen naar dezelfde wet." },
    ],
  },
  {
    code: "SB-2022-149",
    title: "Wet van 30 december 2022 houdende nadere wijziging van de Wet Loonbelasting",
    publication: "S.B. 2022 no. 149",
    publishedAt: "2022-12-30",
    subject: "Verwerking van de heffingskorting in de belastingvrije som; verhoging vrijstelling vakantietoelage",
    article: "diverse artikelen",
    state: "AMENDED",
    lastAmendment: "S.B. 2024 no. 2; S.B. 2025 no. 101 / no. 129",
    summary: "Heffingskorting opgenomen in de belastingvrije som. Vrijstelling vakantietoelage destijds verhoogd naar SRD 6.516 — later opnieuw gewijzigd.",
    articles: [
      { article: "—", summary: "Heffingskorting opgenomen in de belastingvrije som (geen afzonderlijke heffingskorting meer)" },
      { article: "—", summary: "Vrijstelling vakantietoelage SRD 6.516 (inmiddels vervangen door latere staatsbesluiten)" },
    ],
    url: "https://www.sris.sr/wp-content/uploads/2023/01/S.B.-2022-no.-149-wijziging-van-de-Wet-Loonbelasting.pdf",
    verificationStatus: "PENDING_VERIFICATION",
    notes: "Inhoud alleen via secundaire samenvatting bevestigd; volledige tekst nalezen.",
    components: ["Belastingvrije som", "Bijzondere beloningen (vakantietoelage)"],
    evidence: [
      { source: "Zoekresultaat SRIS (S.B. 2022 no. 149)", url: "https://www.sris.sr/wp-content/uploads/2023/01/S.B.-2022-no.-149-wijziging-van-de-Wet-Loonbelasting.pdf", kind: "OFFICIAL_EXCERPT", finding: "Verhoging vrijstelling vakantietoelage naar SRD 6.516.", checkedAt: CHECKED },
    ],
    history: [],
  },
  {
    code: "SB-2024-2",
    title: "Staatsbesluit ter uitvoering van artikel 18a van de Wet Loonbelasting",
    publication: "S.B. 2024 no. 2",
    publishedAt: "2024-01-11",
    effectiveFrom: "2024-01-01",
    subject: "Beroepskostenaftrek, belastingvrije som en tariefschijven loonbelasting",
    article: "art. 12, 13, 14, 17a lid 2",
    state: "AMENDED",
    lastAmendment: "S.B. 2025 no. 101 / no. 129 (bijzondere beloningen en overwerk; art. 12–14 volgens gevonden bronnen ongewijzigd)",
    summary: "Beroepskostenaftrek SRD 4.800 per jaar; belastingvrije som SRD 108.000 per jaar (SRD 9.000 per maand); tarief 8% / 18% / 28% / 38% met schijven van SRD 42.000. Geen wijziging van deze bedragen voor 2026 gevonden.",
    articles: [
      { article: "12", summary: "Beroepskostenaftrek SRD 4.800 per jaar (SRD 400 per maand)" },
      { article: "13", summary: "Belastingvrije som SRD 108.000 per jaar (SRD 9.000 per maand)" },
      { article: "14", summary: "Tarief: 8% tot SRD 42.000; 18% tot SRD 84.000; 28% tot SRD 126.000; 38% daarboven" },
      { article: "17a lid 2", summary: "Afzonderlijke tariefstructuur: 5% / 15% / 25% / 35% (zelfde schijfgrenzen). Toepassingsbereik nog te verifiëren" },
    ],
    url: "https://www.sris.sr/wp-content/uploads/2024/01/S.B.-2024-no.-2-STAATSBESLUIT-11-januari-2024-uitvoeringartikel-18a-Wet-Loonbelasting-S.B.-1981-no.-181-laatstelijk-gewijzigd-S.B.pdf",
    verificationStatus: "PARTIALLY_VERIFIED",
    notes: "Primaire tekst aangeleverd door ARA Intelligent Solutions; belastingvrije som van SRD 9.000 per maand vanaf 1 januari 2024 bevestigd in meerdere publicaties. Art. 17a: toepassingsbereik niet geverifieerd (afzonderlijk regime, niet automatisch toegepast).",
    components: ["Beroepskostenaftrek", "Belastingvrije som", "Tariefschijven art. 14", "Regime art. 17a (niet actief)"],
    evidence: [
      { source: "VSB — Nieuwe maatregelen in de loonbelasting (2024)", url: "https://vsbstia.org/?p=9005", kind: "SECONDARY", finding: "Belastingvrije som per 1 januari 2024 verhoogd naar SRD 9.000 per maand.", checkedAt: CHECKED },
      { source: "Celery — Belastingen en sociale premies 2026", url: "https://www.celerypayroll.com/blog/algemeen/belastingen-en-sociale-premies-2026/", kind: "SECONDARY", finding: "Voor 2026 geen wijzigingen van de loonbelastingtabel ten opzichte van 2025 bekend (bron mogelijk verouderd).", checkedAt: CHECKED },
    ],
    history: [],
  },
  {
    code: "SB-2025-101",
    title: "Staatsbesluit van 22 juli 2025 ter uitvoering van artikel 18a van de Wet Loonbelasting",
    publication: "S.B. 2025 no. 101",
    publishedAt: "2025-07-22",
    effectiveFrom: "2025-07-22",
    subject: "Vrijstelling bijzondere beloningen (vakantietoelage, gratificatie, bonus) en tariefschijven overwerk",
    article: "art. 17 (bijzondere beloningen), art. 17c (overwerk) — artikelnummers nog te bevestigen",
    state: "TO_VERIFY",
    summary: "Vrijstelling bijzondere beloningen van SRD 10.016 naar SRD 19.500 per jaar (terugwerkend tot 1 januari 2025); overwerk 5% tot SRD 2.500, 15% van SRD 2.500 tot SRD 7.500 en 25% daarboven (terugwerkend tot 1 juli 2025).",
    articles: [
      { article: "—", summary: "Vrijstelling bijzondere beloningen SRD 19.500 per jaar, terugwerkend tot 1 januari 2025" },
      { article: "—", summary: "Overwerk: 5% tot SRD 2.500; 15% SRD 2.500–7.500; 25% boven SRD 7.500 (per maand), vanaf 1 juli 2025" },
    ],
    url: "https://www.sris.sr/wp-content/uploads/2025/07/S.B.-2025-no.-101-STAATSBESLUIT-van-22-juli-2025-ter-uitvoering-van-artikel-18a-van-de-Wet-Loonbelasting.pdf",
    verificationStatus: "CONFLICT",
    notes: "Inhoud consistent in meerdere bronnen, maar de verhouding tot S.B. 2025 no. 129 (zelfde onderwerp, 29 oktober 2025) is niet vastgesteld. ARA Payroll gebruikt nog SRD 10.016 als vrijstelling bijzondere beloningen: beheerder moet na verificatie een nieuwe regelset-versie vaststellen.",
    components: ["Bijzondere beloningen (LB-BB): vrijstelling", "Overwerk (LB-OT): schijven"],
    evidence: [
      { source: "HBN Law & Tax — Loonbelastingwijzigingen per Staatsbesluit 22 juli 2025", url: "https://hbnlawtax.com/tax-instant-news/suriname-loonbelastingwijzigingen-per-staatsbesluit-22-juli-2025/", kind: "SECONDARY", finding: "Vrijstelling SRD 10.016 → SRD 19.500 per jaar (terugwerkend tot 1-1-2025); overwerkschijven 5/15/25% (vanaf 1-7-2025).", checkedAt: CHECKED },
      { source: "Starnieuws — Hogere belastingvrije som voor overuren en vakantiegeld", url: "https://www.starnieuws.com/index.php/welcome/index/nieuwsitem/87481", kind: "SECONDARY", finding: "Bevestigt verhoging vrijstelling vakantiegeld/bonussen en nieuwe overwerkschijven.", checkedAt: CHECKED },
      { source: "ICB Instituut — Staatsbesluit van 22 juli 2025", url: "https://icb-instituut.com/staatsbesluit-van-22-juli-2025-t-u-v-artikel-18a-wet-loonbelasting-suriname/", kind: "SECONDARY", finding: "Aanpassing tariefschijven overwerk en verhoging vrijstelling vakantie-uitkeringen.", checkedAt: CHECKED },
    ],
    history: [
      { date: CHECKED, previous: "Status: volgens S.B. 2025 no. 129 ingetrokken.", current: "Status: verhouding tot S.B. 2025 no. 129 niet vastgesteld (conflict).", reason: "Bij hercontrole geen bron gevonden die de intrekking bevestigt; S.B. 2025 no. 129 behandelt volgens ICB hetzelfde onderwerp." },
    ],
  },
  {
    code: "SB-2025-129",
    title: "Staatsbesluit van 29 oktober 2025 ter uitvoering van artikel 18a van de Wet Loonbelasting",
    publication: "S.B. 2025 no. 129",
    publishedAt: "2025-10-31",
    subject: "Verruiming tariefschijven loon uit overwerk en verhoging van het niet tot het loon behorende bedrag bij vakantie-uitkeringen",
    article: "nog te bevestigen",
    state: "TO_VERIFY",
    summary: "Gedateerd 29 oktober 2025, geplaatst in het Staatsblad op 31 oktober 2025. Onderwerp gelijk aan S.B. 2025 no. 101; inhoud (bedragen, ingangsdata) niet ingezien.",
    articles: [],
    url: "https://www.sris.sr/wp-content/uploads/2025/11/S.B.-2025-no.-129-STAATSBESLUIT-ter-uitvoering-van-artikel-18a-van-de-Wet-Loonbelasting.pdf",
    verificationStatus: "CONFLICT",
    components: ["Bijzondere beloningen (LB-BB)", "Overwerk (LB-OT)"],
    evidence: [
      { source: "ICB Instituut — tag Wet Loonbelasting", url: "https://icb-instituut.com/tag/wet-loonbelasting/", kind: "SECONDARY", finding: "Staatsbesluit van 29 oktober 2025 (art. 18a) op 31 oktober 2025 geplaatst als S.B. 2025 no. 129; onderwerp overwerkschijven en vakantie-uitkeringen.", checkedAt: CHECKED },
    ],
    history: [
      { date: CHECKED, previous: "Trekt S.B. 2025 no. 101 in; overige inhoud niet geverifieerd. Publicatiedatum 29-10-2025.", current: "Onderwerp overwerkschijven en vakantie-uitkeringen; intrekking van no. 101 niet bevestigd. Besluit 29-10-2025, publicatie 31-10-2025.", reason: "Nieuwe secundaire bron over onderwerp en publicatiedatum; eerdere bewering over intrekking niet onderbouwd." },
    ],
  },
  {
    code: "KB-2026-ONTWERP",
    title: "Ontwerp-staatsbesluit vrijstelling kinderbijslag (art. 10 Wet Loonbelasting)",
    publication: "Ontwerp (april 2026) — geen Staatsbladnummer gevonden",
    subject: "Verdubbeling vrijgestelde kinderbijslag: SRD 125 → SRD 250 per kind per maand; maximum SRD 500 → SRD 1.000",
    article: "art. 10",
    state: "TO_VERIFY",
    summary: "Alleen als ontwerp gemeld. Niet toegepast: ARA Payroll gebruikt de vastgestelde vrijstelling uit de actieve regelset tot een gepubliceerd staatsbesluit is geverifieerd.",
    articles: [],
    verificationStatus: "PENDING_VERIFICATION",
    components: ["Kinderbijslag (vrijstelling)"],
    evidence: [
      { source: "Dagblad Suriname — Kinderbijslag verdubbeld, maar kader blijft beperkt (20-04-2026)", url: "https://www.dbsuriname.com/2026/04/20/kinderbijslag-verdubbeld-maar-kader-blijft-beperkt/", kind: "SECONDARY", finding: "Ontwerp-staatsbesluit: vrijstelling SRD 250 per kind per maand, maximum SRD 1.000.", checkedAt: CHECKED },
    ],
    history: [],
  },
  {
    code: "WET-AOV",
    title: "Wet Algemene Oudedagsvoorziening",
    publication: "Wet van 20 maart 1981 tot instelling van een Algemene Oudedagsvoorziening (zoals gewijzigd)",
    publishedAt: "1981-03-20",
    subject: "AOV-premie",
    article: "premieartikelen (nummering te bevestigen)",
    state: "AMENDED",
    summary: "Premie 4% van de heffingsgrondslag (zuiver loon / zuiver inkomen). Premieplichtig: ingezetenen met loon of winst die de leeftijd van 60 jaar nog niet hebben bereikt. Heffing o.a. door inhouding op het loon; geen werkgeversdeel en geen franchise gevonden.",
    articles: [
      { article: "—", summary: "Premie 4% van de heffingsgrondslag" },
      { article: "—", summary: "Grondslag: zuiver inkomen (IB 1922) of, als loonbelasting verschuldigd is, het zuiver loon (Wet Loonbelasting)" },
      { article: "—", summary: "Premieplichtig: ingezetene die de leeftijd van 60 jaar nog niet heeft bereikt; heffing o.a. door inhouding op het loon" },
    ],
    url: "https://belastingdienst.sr/wp-content/uploads/2024/10/Wet-AOV.pdf",
    verificationStatus: "PARTIALLY_VERIFIED",
    notes: "Aangifte loonbelasting en premie AOV is één gecombineerde maandaangifte. Verdeling werkgever/werknemer niet in de wettekst gevonden (ARA Payroll: 100% werknemer).",
    components: ["AOV (werknemer)", "AOV werkgeversdeel (0%)", "Leeftijdsgrens 60 jaar"],
    evidence: [
      { source: "Belastingdienst Suriname — Wet AOV (pdf, uittreksel)", url: "https://belastingdienst.sr/wp-content/uploads/2024/10/Wet-AOV.pdf", kind: "OFFICIAL_EXCERPT", finding: "Premie 4% van de heffingsgrondslag; premieplichtig tot 60 jaar; heffing door inhouding op het loon.", checkedAt: CHECKED },
      { source: "Dagblad Suriname — AOV is geen cadeautje van de regering (21-08-2026)", url: "https://www.dbsuriname.com/2026/08/21/aov-is-geen-cadeautje-van-de-regering/", kind: "SECONDARY", finding: "Bevestigt 4% van de heffingsgrondslag.", checkedAt: CHECKED },
    ],
    history: [],
  },
  {
    code: "SB-2019-64",
    title: "Wet Arbeidsbescherming Gezin (bescherming moederschap)",
    publication: "S.B. 2019 no. 64",
    publishedAt: "2019-06-10",
    subject: "Zwangerschaps- en bevallingsverlof, vaderschapsverlof, adoptieverlof en het Fonds Voorzieningen Ouderschapsverlof",
    article: "o.a. art. 6 (adoptieverlof); overige artikelnummers te bevestigen",
    state: "IN_FORCE",
    summary: "Zwangerschaps- en bevallingsverlof samen 16 weken (4–6 weken vóór de bevalling), 24 weken bij drie- of meerlingen; vaderschapsverlof 8 dagen vanaf de dag van de bevalling; adoptieverlof 6 weken bij adoptie van een kind jonger dan 18 maanden. Volledig doorbetaald; het FVO zorgt voor de doorbetaling.",
    articles: [
      { article: "—", summary: "Zwangerschaps- en bevallingsverlof samen max. 16 weken (24 weken bij meerlingen van drie of meer); 4–6 weken vóór de bevalling" },
      { article: "6", summary: "Adoptie van een kind jonger dan 18 maanden: 6 weken betaald verlof voor de adoptiemoeder" },
      { article: "—", summary: "Vaderschapsverlof: 8 dagen betaald verlof, ingaand op de dag van de bevalling" },
      { article: "—", summary: "Loondoorbetaling via het Fonds Voorzieningen Ouderschapsverlof (FVO)" },
    ],
    url: "https://www.dna.sr/media/3bjewn4q/sb_2019___64.pdf",
    verificationStatus: "PARTIALLY_VERIFIED",
    notes: "Ouderschapsverlof (zorgverlof na de geboorteperiode) is in deze wet niet gevonden en blijft bedrijfsbeleid. Adoptieverlof voor adoptievaders en kinderen vanaf 18 maanden niet bevestigd.",
    components: ["LEV007 Zwangerschaps- en bevallingsverlof", "LEV008 Vaderschapsverlof", "LEV009 Adoptieverlof", "FVO"],
    evidence: [
      { source: "Overheid Suriname — Werkgevers verplicht tot 16 weken zwangerschaps- en bevallingsverlof", url: "https://gov.sr/werkgevers-verplicht-tot-16-weken-zwangerschaps-en-bevallingsverlof/", kind: "OFFICIAL_EXCERPT", finding: "16 weken, bij drie- of meerlingen 24 weken.", checkedAt: CHECKED },
      { source: "Overheid Suriname — Toelichting op Wet Arbeidsbescherming voor Gezin", url: "https://gov.sr/toelichting-op-wet-arbeidsbescherming-voor-gezin/", kind: "OFFICIAL_EXCERPT", finding: "Vaderschapsverlof 8 dagen betaald verlof; doorbetaling via het FVO.", checkedAt: CHECKED },
      { source: "DNA — S.B. 2019 no. 64 (uittreksel)", url: "https://www.dna.sr/media/3bjewn4q/sb_2019___64.pdf", kind: "OFFICIAL_EXCERPT", finding: "Art. 6: adoptie kind < 18 maanden — 6 weken betaald verlof voor de adoptiemoeder.", checkedAt: CHECKED },
      { source: "Starnieuws/SR Herald — Voortaan maximaal 24 weken verlof bij zwangerschap (2019)", url: "https://www.srherald.com/suriname/2019/04/12/voortaan-maximaal-24-weken-verlof-bij-zwangerschap/", kind: "SECONDARY", finding: "Vaderschapsverlof bij behandeling verruimd van 5 naar 8 dagen.", checkedAt: CHECKED },
    ],
    history: [
      { date: CHECKED, previous: "Vaderschapsverlof: duur volgens bronnen 5, 7 of 8 dagen (conflict).", current: "Vaderschapsverlof: 8 dagen (gedeeltelijk geverifieerd).", reason: "Overheidspublicatie en parlementaire berichtgeving noemen 8 dagen (verruimd van oorspronkelijk voorgestelde 5)." },
      { date: CHECKED, previous: "Loondoorbetaling via fonds (FVO); bijdrage volgens berichtgeving 1% van het brutoloon — niet geverifieerd.", current: "Premie FVO vastgelegd in afzonderlijke registervermelding FVO (grondslag: basisloon, niet brutoloon).", reason: "Officiële FVO- en overheidspublicaties noemen het basismaandloon exclusief toelagen en emolumenten als grondslag." },
    ],
  },
  {
    code: "FVO",
    title: "Fonds Voorzieningen Ouderschapsverlof — premie, afdracht en uitkeringen",
    publication: "Wet Arbeidsbescherming Gezin (S.B. 2019 no. 64), art. 12 lid 4",
    publishedAt: "2019-06-10",
    effectiveFrom: "2023-04-01",
    subject: "FVO-premie: 1% van het brutoloon (basisloon zonder toelagen en emolumenten); werknemer maximaal en werkgever minimaal de helft",
    article: "art. 12 lid 4 en 5",
    state: "IN_FORCE",
    summary: "Iedere werknemer en werkgever betaalt aan het Fonds een bijdrage van 1,0% van het brutoloon van de werknemer; de werknemersbijdrage is maximaal 50% en de werkgeversbijdrage minimaal 50% daarvan. De werkgever houdt de werknemersbijdrage bij elke loonbetaling in en draagt beide bijdragen af, en verstrekt de werknemer bij elke loonbetaling het bewijs van betaling. Volgens het FVO wordt de premie berekend over het basisloon zonder toelagen en emolumenten en geldt de premie per 1 april 2023. Geen maximumgrondslag.",
    articles: [
      { article: "12 lid 4", summary: "Bijdrage 1,0% van het brutoloon; werknemer maximaal 50%, werkgever minimaal 50%; inhouding bij elke loonbetaling en afdracht door de werkgever" },
      { article: "12 lid 5", summary: "Werkgever verstrekt bij elke loonbetaling het bewijs dat de bijdrage is voldaan" },
      { article: "FVO FAQ 3, 8, 12", summary: "Grondslag basisloon zonder toelagen en emolumenten; 0,5% werknemer en 0,5% werkgever; premie per 1 april 2023" },
    ],
    url: "https://www.dna.sr/media/3bjewn4q/sb_2019___64.pdf",
    verificationStatus: "VERIFIED",
    notes: "Geverifieerd tegen de wettekst (S.B. 2019 no. 64, art. 12 lid 4) en de FAQ van het Fonds. ARA Payroll stelt 0,5% werknemer en 0,5% werkgever in over het basissalaris; een werkgever mag een groter deel dragen (werknemersdeel lager).",
    components: ["FVO-EE (werknemersaandeel)", "FVO-ER (werkgeversaandeel)", "DED012", "ER007"],
    evidence: [
      { source: "DNA — S.B. 2019 no. 64 (Wet Arbeidsbescherming Gezin), volledige tekst", url: "https://www.dna.sr/media/3bjewn4q/sb_2019___64.pdf", kind: "OFFICIAL_TEXT", finding: "Art. 12 lid 4: bijdrage gelijk aan 1.0% van het brutoloon, werknemersbijdrage maximaal 50%, werkgeversbijdrage minimaal 50%; inhouding bij elke loonbetaling.", checkedAt: VERIFIED_AT },
      { source: "FVO — Veelgestelde vragen", url: "https://fvo.sr/nl/faq", kind: "OFFICIAL_EXCERPT", finding: "1% van het brutoloon (basisloon zonder emolumenten), 0,5% werknemer en 0,5% werkgever; premie van kracht per 1 april 2023.", checkedAt: VERIFIED_AT },
      { source: "Overheid Suriname — Registratieplicht voor doorbetaald ouderschapsverlof aangevangen", url: "https://gov.sr/registratieplicht-voor-doorbetaald-ouderschapsverlof-aangevangen/", kind: "OFFICIAL_EXCERPT", finding: "Registratie vóór 15 februari 2023; inning vanaf 1 maart 2023.", checkedAt: CHECKED },
    ],
    history: [
      { date: CHECKED, previous: "Percentage en verdeling werkgever/werknemer niet geverifieerd; berichtgeving noemt 1% van het brutoloon.", current: "1% van het basismaandloon (excl. toelagen en emolumenten); werknemer max. 0,5%, werkgever min. 0,5% — gedeeltelijk geverifieerd.", reason: "Officiële FVO- en overheidspublicaties noemen het basismaandloon; 'brutoloon' komt alleen uit secundaire bronnen." },
      { date: VERIFIED_AT, previous: "Gedeeltelijk geverifieerd; premieartikel niet ingezien.", current: "Geverifieerd: S.B. 2019 no. 64 art. 12 lid 4 — 1,0% van het brutoloon, werknemer max. 50%, werkgever min. 50%; ingang premie 1 april 2023 (FVO).", reason: "Wettekst op dna.sr en FAQ van het Fonds ingezien." },
    ],
  },
  {
    code: "WAP-2014",
    title: "Wet Algemeen Pensioen 2014",
    publication: "S.B. 2014 no. 113",
    publishedAt: "2014-09-09",
    effectiveFrom: "2014-12-09",
    subject: "Verplichte algemene pensioenregeling voor werknemers (Algemeen Pensioenfonds of gelijkwaardige eigen regeling van de werkgever)",
    article: "art. 2, 6 (loon), 8 (premie)",
    state: "AMENDED",
    lastAmendment: "S.B. 2023 no. 118 (art. 8 lid 3)",
    summary: "Premie: 3% van de bijdragegrondslag bij inwerkingtreding, vanaf 1 januari 2016 jaarlijks verhoogd met 0,5% tot maximaal 28% (art. 8 lid 1–2): 2023 7%, 2024 7,5%, 2025 8%, 2026 8,5%, 2027 9%. Verdeling bij een dienstbetrekking 50% werknemer en 50% werkgever; bij onderling overleg mag het werknemersdeel niet hoger zijn dan het werkgeversdeel (art. 8 lid 7–8). Minimale en maximale bijdragegrondslag sinds 1 januari 2023 SRD 2.250 en SRD 22.500 per maand (S.B. 2023 no. 118); de minimumpremie geldt ongeacht het maandloon (art. 8 lid 4). Loon is elke geldelijke vergoeding behalve overwerk, vergoedingen voor tijdelijke extra werkzaamheden, vakantie-uitkeringen, winstuitkeringen, voorwaardelijke uitkeringen, onkostenvergoedingen, uitkeringen aan gezinshoofden en eindejaarsuitkeringen (art. 6). Een eigen pensioenregeling die minimaal gelijkwaardig is, mag blijven (art. 2 lid 3–5).",
    articles: [
      { article: "6 lid 1", summary: "Loon = elke geldelijke vergoeding, behalve overwerk, tijdelijke extra werkzaamheden, vakantie-uitkeringen, winstuitkeringen, voorwaardelijke uitkeringen, onkostenvergoedingen, uitkeringen aan gezinshoofden en eindejaarsuitkeringen" },
      { article: "8 lid 1–2", summary: "Premie 3% bij inwerkingtreding; vanaf 1 januari 2016 jaarlijks +0,5% tot maximaal 28% (2026: 8,5%)" },
      { article: "8 lid 3 (S.B. 2023 no. 118)", summary: "Minimale bijdragegrondslag SRD 2.250, maximale SRD 22.500 per maand" },
      { article: "8 lid 4–5", summary: "Minimumpremie over de minimale grondslag ongeacht het maandloon; geen premie boven de maximale grondslag" },
      { article: "8 lid 7–8", summary: "Werknemer 50%, werkgever 50%; werknemersdeel nooit hoger dan werkgeversdeel" },
    ],
    url: "https://www.dna.sr/media/yjol5xwe/sb_2014__no_113_wet_algemeen_pensioen_2014.pdf",
    verificationStatus: "VERIFIED",
    notes: "Geverifieerd tegen de wettekst (DNA) en S.B. 2023 no. 118. Werkgevers met een eigen, door de Pensioenraad als gelijkwaardig beoordeelde regeling stellen hun eigen percentages in (pensioenpercentage in de arbeidsovereenkomst of een eigen regeling).",
    components: ["PENSION-EE", "PENSION-ER", "DED002", "ER001", "Pensioenpercentage arbeidsovereenkomst"],
    evidence: [
      { source: "DNA — S.B. 2014 no. 113 Wet Algemeen Pensioen 2014 (volledige tekst)", url: "https://www.dna.sr/media/yjol5xwe/sb_2014__no_113_wet_algemeen_pensioen_2014.pdf", kind: "OFFICIAL_TEXT", finding: "Art. 8: premie 3%, vanaf 1-1-2016 jaarlijks +0,5% tot max. 28%; verdeling 50/50; art. 6: definitie loon met uitzonderingen.", checkedAt: VERIFIED_AT },
      { source: "S.B. 2023 no. 118 (Staatsbesluit ter uitvoering van art. 8 lid 6 WAP 2014)", url: "https://www.celerypayroll.com/wp-content/uploads/2023/10/S.B.-2023-no.-118-STAATSBESLUIT-van-7-augustus-ter-uitvoering-van-artikel-8-lid-6-van-de-Wet-Algemeen-Pensioen-2014-S.B.-2014-no.-113.pdf", kind: "OFFICIAL_TEXT", finding: "Art. I: minimale bijdragegrondslag SRD 2.250 en maximale SRD 22.500 per maand; terugwerkend tot 1 januari 2023 (art. II).", checkedAt: VERIFIED_AT },
      { source: "Algemeen Pensioenfonds — Veelgestelde vragen", url: "https://www.pensioen.sr/veelgestelde-vragen/", kind: "OFFICIAL_EXCERPT", finding: "Premie 2025: 8% (consistent met art. 8 lid 2).", checkedAt: CHECKED },
    ],
    history: [
      { date: VERIFIED_AT, previous: "Gedeeltelijk geverifieerd: premie 2025 8% volgens APF, premie 2026 niet gevonden.", current: "Geverifieerd: premie volgens art. 8 lid 2 (2026: 8,5%, 2027: 9%), verdeling 50/50, grondslag SRD 2.250–22.500 per maand (S.B. 2023 no. 118).", reason: "Wettekst S.B. 2014 no. 113 en staatsbesluit S.B. 2023 no. 118 ingezien." },
    ],
  },
  {
    code: "SB-2023-118",
    title: "Staatsbesluit van 7 augustus 2023 ter uitvoering van artikel 8 lid 6 van de Wet Algemeen Pensioen 2014",
    publication: "S.B. 2023 no. 118",
    publishedAt: "2023-08-18",
    effectiveFrom: "2023-01-01",
    subject: "Minimum- en maximumgrondslag pensioenpremie",
    article: "art. I (nieuw art. 8 lid 3 WAP 2014), art. II",
    state: "IN_FORCE",
    summary: "Artikel 8 lid 3 WAP 2014 luidt: de minimale bijdragegrondslag bedraagt SRD 2.250 per maand en de maximale bijdragegrondslag SRD 22.500 per maand. Uitgegeven 18 augustus 2023, terugwerkend tot en met 1 januari 2023 (index 450 × SRD 500 / SRD 5.000).",
    articles: [
      { article: "I", summary: "Minimale bijdragegrondslag SRD 2.250 per maand; maximale SRD 22.500 per maand" },
      { article: "II lid 2", summary: "In werking de dag na afkondiging, terugwerkend tot en met 1 januari 2023" },
    ],
    url: "https://www.celerypayroll.com/wp-content/uploads/2023/10/S.B.-2023-no.-118-STAATSBESLUIT-van-7-augustus-ter-uitvoering-van-artikel-8-lid-6-van-de-Wet-Algemeen-Pensioen-2014-S.B.-2014-no.-113.pdf",
    verificationStatus: "VERIFIED",
    notes: "Tekst van het Staatsblad ingezien (gepubliceerde kopie). Geen later staatsbesluit over de grondslagen gevonden op de officiële sites; controleer jaarlijks bij het Algemeen Pensioenfonds.",
    components: ["Pensioen: minimum- en maximumgrondslag"],
    evidence: [
      { source: "S.B. 2023 no. 118 (Staatsblad, volledige tekst)", url: "https://www.celerypayroll.com/wp-content/uploads/2023/10/S.B.-2023-no.-118-STAATSBESLUIT-van-7-augustus-ter-uitvoering-van-artikel-8-lid-6-van-de-Wet-Algemeen-Pensioen-2014-S.B.-2014-no.-113.pdf", kind: "OFFICIAL_TEXT", finding: "Minimale bijdragegrondslag SRD 2.250, maximale SRD 22.500 per maand; terugwerkend tot 1 januari 2023.", checkedAt: VERIFIED_AT },
    ],
    history: [
      { date: VERIFIED_AT, previous: "Gedeeltelijk geverifieerd via secundaire bron (maximum genoemd als SRD 270.000 per jaar).", current: "Geverifieerd: SRD 2.250 en SRD 22.500 per maand.", reason: "Tekst van het Staatsblad ingezien." },
    ],
  },
  {
    code: "WNBZ-2014",
    title: "Wet Nationale Basiszorgverzekering",
    publication: "S.B. 2014 no. 114",
    publishedAt: "2014-09-09",
    effectiveFrom: "2014-10-09",
    subject: "Verplichte basiszorgverzekering; werkgever verzekert iedere werknemer; premie volgens de polis, verdeling 50/50",
    article: "art. 4, 7, 8",
    state: "IN_FORCE",
    summary: "Iedere werkgever sluit voor zijn werknemers een basiszorgverzekering af, maakt afspraken over de inhouding van het werknemersaandeel op het loon en draagt de premie conform de polisvoorwaarden tijdig af aan de zorgverzekeraar (art. 8). De premie is een vast bedrag per deelnemer volgens de polis van de zorgverzekeraar, binnen de wettelijke maximale premie per leeftijdscategorie (art. 7 lid 1; bij invoering SRD 55 / 75 / 165 / 240, wijziging bij staatsbesluit). Bij een dienstbetrekking: 50% werknemer, 50% werkgever; het werknemersaandeel mag nooit hoger zijn dan het werkgeversaandeel (art. 7 lid 6–7).",
    articles: [
      { article: "7 lid 1–2", summary: "Maximale premie per leeftijdscategorie (2014: 0–16 SRD 55, 17–20 SRD 75, 21–59 SRD 165, 60+ SRD 240); wijziging bij staatsbesluit" },
      { article: "7 lid 6–7", summary: "Werknemer 50%, werkgever 50%; werknemersaandeel nooit hoger dan werkgeversaandeel" },
      { article: "8 lid 1–2", summary: "Werkgever sluit de verzekering af, houdt het werknemersaandeel in en draagt de premie conform de polis af" },
    ],
    url: "https://www.dna.sr/media/wsxjnsrb/sb_2014__no_114_wet_nationale_basiszorgverzekering.pdf",
    verificationStatus: "VERIFIED",
    notes: "De verdeling en de verplichtingen zijn geverifieerd. Het premiebedrag is bedrijfsspecifiek: neem het maandbedrag over uit de polis van uw zorgverzekeraar (eventueel per werknemer verschillend via individuele bedragen). ARA Payroll vult geen bedrag in.",
    components: ["HEALTH-EE", "HEALTH-ER", "DED004", "ER002"],
    evidence: [
      { source: "DNA — S.B. 2014 no. 114 Wet Nationale Basiszorgverzekering (volledige tekst)", url: "https://www.dna.sr/media/wsxjnsrb/sb_2014__no_114_wet_nationale_basiszorgverzekering.pdf", kind: "OFFICIAL_TEXT", finding: "Art. 7: maximale premies per leeftijdscategorie, verdeling 50/50; art. 8: verplichtingen werkgever, premie conform polisvoorwaarden.", checkedAt: VERIFIED_AT },
      { source: "Overheid Suriname — Basiszorgverzekering", url: "https://gov.sr/thema/basiszorgverzekering/", kind: "OFFICIAL_EXCERPT", finding: "Iedere werkgever is verplicht minimaal 50% van de premie te betalen.", checkedAt: CHECKED },
    ],
    history: [
      { date: VERIFIED_AT, previous: "Gedeeltelijk geverifieerd; artikelnummers en premiebedragen niet bevestigd.", current: "Geverifieerd: art. 7 lid 6–7 (50/50) en art. 8 (premie conform polis); premiebedrag volgt uit de polis van de zorgverzekeraar.", reason: "Wettekst S.B. 2014 no. 114 op dna.sr ingezien." },
    ],
  },
  {
    code: "VACANTIEWET",
    title: "Vakantiewet",
    publication: "Vakantiewet 1975 (zoals gewijzigd)",
    subject: "Vakantiedagen en vakantietoelage",
    article: "nog te bevestigen",
    state: "TO_VERIFY",
    summary: "Volgens een fragment van de wettekst is de werkgever verplicht over de betreffende periode een vakantietoelage uit te betalen; hoogte en voorwaarden niet bevestigd. Vakantiedagen: 12 per jaar, oplopend (maximum volgens secundaire bron 18).",
    articles: [],
    url: "https://www.dna.sr/media/egnb5dhm/vakantiewet.pdf",
    verificationStatus: "PENDING_VERIFICATION",
    notes: "ARA Payroll berekent de vakantietoelage alleen zoals de werkgever die instelt (vast of percentage); geen wettelijk percentage toegepast.",
    components: ["BON006 Vakantietoelage", "Verlofsaldo jaarlijks verlof"],
    evidence: [
      { source: "DNA — Vakantiewet (fragment)", url: "https://www.dna.sr/media/egnb5dhm/vakantiewet.pdf", kind: "OFFICIAL_EXCERPT", finding: "'… is de werkgever verplicht hem tenminste over die periode de vakantietoelage uit te betalen' (fragment, context ontbreekt).", checkedAt: CHECKED },
      { source: "Doing Business Dutch Caribbean — Annual leave Suriname", url: "https://www.doingbusinessdutchcaribbean.com/suriname/employment-sur/annual-leave-sur/", kind: "SECONDARY", finding: "Vakantiedagen lopen op tot maximaal 18 per jaar.", checkedAt: CHECKED },
    ],
    history: [],
  },
  {
    code: "ARBEIDSWET-1963",
    title: "Arbeidswet",
    publication: "Arbeidswet 1963 (zoals gewijzigd); Wet Werktijdenregeling 2019",
    subject: "Arbeidstijden en overwerk",
    article: "art. 64 e.v. (overwerk)",
    state: "TO_VERIFY",
    summary: "Overwerkbepalingen vanaf art. 64; toeslagpercentages (150% / 200%) niet in de wettekst bevestigd. In ARA Payroll zijn de overwerkpercentages bedrijfsinstellingen (contract/cao).",
    articles: [],
    url: "https://www.dna.sr/media/cwabf0np/arbeidswet.pdf",
    verificationStatus: "PENDING_VERIFICATION",
    components: ["OT1 Overwerk 150%", "OT2 Overwerk 200%"],
    evidence: [
      { source: "Rivermate — Werktijden Suriname", url: "https://rivermate.com/nl/gidsen/suriname/werktijden", kind: "SECONDARY", finding: "Overwerk meestal 150% op weekdagen, hoger op weekenden en feestdagen — niet officieel.", checkedAt: CHECKED },
    ],
    history: [],
  },
];
