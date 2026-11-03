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
export type Evidence = { source: string; url: string; kind: "OFFICIAL_EXCERPT" | "SECONDARY"; finding: string; checkedAt: string };
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
    publication: "Wet Arbeidsbescherming Gezin (S.B. 2019 no. 64) en uitvoeringsregels van het FVO",
    effectiveFrom: "2023-03-01",
    subject: "FVO-premie: 1% van het basismaandloon, verdeeld tussen werkgever (minimaal de helft) en werknemer (maximaal de helft)",
    article: "premieartikel S.B. 2019 no. 64 (nummer te bevestigen)",
    state: "IN_FORCE",
    summary: "Totale premie 1% van het basismaandloon exclusief toelagen en emolumenten. Werknemersdeel maximaal 0,5%, werkgeversdeel minimaal 0,5%. De werkgever houdt het werknemersdeel bij elke loonbetaling in en draagt beide delen maandelijks af (uiterlijk de 14e van de volgende maand). Geen maximum gevonden. Uitkeringen pas na minimaal 3 maanden premiebetaling (niet voor werkgevers die vóór 1 juli 2023 geregistreerd waren).",
    articles: [
      { article: "—", summary: "Premie 1% van het basismaandloon (exclusief toelagen en emolumenten)" },
      { article: "—", summary: "Werknemer maximaal 50%, werkgever minimaal 50% van de premie" },
      { article: "—", summary: "Maandelijkse afdracht door de werkgever, uiterlijk de 14e van de volgende maand" },
    ],
    url: "https://fvo.sr/nl/faq",
    verificationStatus: "PARTIALLY_VERIFIED",
    notes: "Tegenstrijdigheden: (1) start inning 1 maart 2023 (overheid) of april 2023 (Celery); (2) verdeling 'gelijk' (overheid/FVO) of 'werkgever mag alles dragen' (Celery). Het premieartikel in de wettekst is niet ingezien. Daarom blijft de FVO-regeling inactief tot een beheerder de officiële grondslag heeft geverifieerd en de tarieven heeft goedgekeurd.",
    components: ["FVO-EE (werknemersaandeel)", "FVO-ER (werkgeversaandeel)", "DED012", "ER007"],
    evidence: [
      { source: "FVO — Veelgestelde vragen", url: "https://fvo.sr/nl/faq", kind: "OFFICIAL_EXCERPT", finding: "Premie berekend over het basismaandloon, exclusief toelagen en emolumenten; welke vergoedingen het FVO vergoedt.", checkedAt: CHECKED },
      { source: "Overheid Suriname — FVO", url: "https://gov.sr/fvo/", kind: "OFFICIAL_EXCERPT", finding: "Grondslag basissalaris exclusief emolumenten; werkgever minimaal en werknemer maximaal de helft van 1%.", checkedAt: CHECKED },
      { source: "Overheid Suriname — Registratieplicht voor doorbetaald ouderschapsverlof aangevangen", url: "https://gov.sr/registratieplicht-voor-doorbetaald-ouderschapsverlof-aangevangen/", kind: "OFFICIAL_EXCERPT", finding: "Registratie vóór 15 februari 2023; inning vanaf 1 maart 2023.", checkedAt: CHECKED },
      { source: "VSB — Stand van zaken ouderschapsverlofregeling", url: "https://vsbstia.org/?p=8108", kind: "SECONDARY", finding: "Werkgever en werknemer elk 0,5% van het brutoloon; afdracht maandelijks.", checkedAt: CHECKED },
      { source: "Celery — Fonds Voorzieningen Ouderschapsverlof (FVO)", url: "https://www.celerypayroll.com/blog/algemeen/suriname-fonds-voorzieningen-ouderschapsverlof-fvo/", kind: "SECONDARY", finding: "1% totaal, 0,5% werkgever en 0,5% werknemer; start april 2023; werkgever mag het volledige bedrag dragen.", checkedAt: CHECKED },
    ],
    history: [
      { date: CHECKED, previous: "Percentage en verdeling werkgever/werknemer niet geverifieerd; berichtgeving noemt 1% van het brutoloon.", current: "1% van het basismaandloon (excl. toelagen en emolumenten); werknemer max. 0,5%, werkgever min. 0,5% — gedeeltelijk geverifieerd.", reason: "Officiële FVO- en overheidspublicaties noemen het basismaandloon; 'brutoloon' komt alleen uit secundaire bronnen." },
    ],
  },
  {
    code: "WAP-2014",
    title: "Wet Algemeen Pensioen 2014",
    publication: "S.B. 2014 no. 113",
    publishedAt: "2014-09-09",
    effectiveFrom: "2014-12-09",
    subject: "Verplichte algemene pensioenvoorziening voor werknemers (Algemeen Pensioenfonds of gelijkwaardige regeling van de werkgever)",
    article: "art. 8 (premie), art. 7 (indexering)",
    state: "AMENDED",
    lastAmendment: "S.B. 2023 no. 117 en no. 118",
    summary: "Werkgevers moeten hun werknemers een pensioenregeling bieden (via het Algemeen Pensioenfonds of een aan de wet aangepaste eigen regeling). Werkgever betaalt minimaal 50%, werknemer maximaal 50% van de premie. Premie 2025 volgens het APF: 8% van het brutoloon (art. 8 lid 2). Pensioengrondslag sinds 1 januari 2023: minimaal SRD 2.250 en maximaal SRD 22.500 per maand.",
    articles: [
      { article: "8 lid 2", summary: "Premie 2025: 8% van het brutoloon (volgens het Algemeen Pensioenfonds); premie 2026 niet gevonden" },
      { article: "8 lid 6", summary: "Minimum- en maximumgrondslag bij staatsbesluit (zie S.B. 2023 no. 118)" },
      { article: "—", summary: "Werkgever minimaal 50%, werknemer maximaal 50% van de premie" },
    ],
    url: "https://www.dna.sr/media/edbanrlx/wet_algemeen_pensioen_2014.pdf",
    verificationStatus: "PARTIALLY_VERIFIED",
    notes: "Nieuw opgenomen. Pensioen is daarmee een wettelijke verplichting (in ARA Payroll stond pensioen standaard als arbeidsvoorwaardelijk). Eigen pensioenregelingen van werkgevers kunnen afwijkende (gelijkwaardige) tarieven hebben.",
    components: ["PENSION-EE", "PENSION-ER", "DED002", "ER001", "Pensioenpercentage arbeidsovereenkomst"],
    evidence: [
      { source: "Algemeen Pensioenfonds — Veelgestelde vragen", url: "https://www.pensioen.sr/veelgestelde-vragen/", kind: "OFFICIAL_EXCERPT", finding: "Premie 2025: 8% van het brutoloon (art. 8 lid 2); werkgever minimaal 50%, werknemer maximaal 50%.", checkedAt: CHECKED },
      { source: "DNA — Wet Algemeen Pensioen 2014 (uittreksel)", url: "https://www.dna.sr/media/edbanrlx/wet_algemeen_pensioen_2014.pdf", kind: "OFFICIAL_EXCERPT", finding: "Werkgever past bestaande regeling aan of sluit zich aan bij de wet; pensioenrecht na minimaal 5 jaar premiebetaling.", checkedAt: CHECKED },
      { source: "Celery — What employers should know about the APF pension scheme", url: "https://www.celerypayroll.com/en/blog/general/suriname-what-employers-should-know-about-the-pension-scheme-of-the-algemeen-pensioenfonds-apf/", kind: "SECONDARY", finding: "2023: totaal 7% (3,5% / 3,5%).", checkedAt: CHECKED },
      { source: "Milliman — IFRS-waarderingen werkgevers Suriname", url: "https://www.milliman.com/nl-NL/insight/ifrs-waarderingen-werkgevers-suriname-impact-wet-algemeen-pensioen", kind: "SECONDARY", finding: "Werkgevers verplicht een minimale pensioenregeling te bieden; vermeldt een maximumsalaris van SRD 5.000 (verouderd).", checkedAt: CHECKED },
    ],
    history: [],
  },
  {
    code: "SB-2023-118",
    title: "Staatsbesluit van 7 augustus 2023 ter uitvoering van artikel 8 lid 6 van de Wet Algemeen Pensioen 2014",
    publication: "S.B. 2023 no. 118",
    publishedAt: "2023-08-07",
    effectiveFrom: "2023-01-01",
    subject: "Minimum- en maximumgrondslag pensioenpremie",
    article: "uitvoering art. 8 lid 6 WAP 2014",
    state: "IN_FORCE",
    summary: "Minimumgrondslag SRD 2.250 per maand (was SRD 500); maximumgrondslag SRD 270.000 per jaar / SRD 22.500 per maand (was SRD 60.000 per jaar), terugwerkend tot 1 januari 2023.",
    articles: [{ article: "—", summary: "Minimum SRD 2.250 per maand; maximum SRD 22.500 per maand (SRD 270.000 per jaar)" }],
    url: "https://www.celerypayroll.com/wp-content/uploads/2023/10/S.B.-2023-no.-118-STAATSBESLUIT-van-7-augustus-ter-uitvoering-van-artikel-8-lid-6-van-de-Wet-Algemeen-Pensioen-2014-S.B.-2014-no.-113.pdf",
    verificationStatus: "PARTIALLY_VERIFIED",
    components: ["Pensioen: minimum- en maximumgrondslag"],
    evidence: [
      { source: "Celery — Major changes pension scheme APF", url: "https://www.celerypayroll.com/en/blog/general/suriname-major-changes-pension-scheme-of-algemeen-pensioenfonds-apf/", kind: "SECONDARY", finding: "Minimum SRD 2.250 per maand, maximum SRD 270.000 per jaar, terugwerkend tot 1 januari 2023.", checkedAt: CHECKED },
    ],
    history: [],
  },
  {
    code: "WNBZ-2014",
    title: "Wet Nationale Basiszorgverzekering",
    publication: "Wet Nationale Basiszorgverzekering (2014)",
    effectiveFrom: "2014-10-09",
    subject: "Verplichte basiszorgverzekering; werkgever verzekert iedere werknemer en betaalt minimaal 50% van de premie",
    article: "werkgeversverplichtingen (nummering te bevestigen)",
    state: "IN_FORCE",
    summary: "De werkgever sluit voor iedere werknemer een basiszorgverzekering af, betaalt minimaal 50% van de premie, spreekt de inhouding van het werknemersdeel af en draagt de premie tijdig af. Premie per leeftijdscategorie (vast bedrag, geen percentage); de actuele bedragen zijn niet bevestigd (2014: SRD 55 / 75 / 165 / 240).",
    articles: [
      { article: "—", summary: "Werkgever minimaal 50% van de premie; werknemersdeel ingehouden op het loon" },
      { article: "—", summary: "Premie per leeftijdscategorie (vast bedrag); actuele bedragen niet bevestigd" },
    ],
    url: "https://www.basiszorg.sr/index.php/basiszorgverzekering-2/wetnationalebasiszorgverzekering/",
    verificationStatus: "PARTIALLY_VERIFIED",
    notes: "Bronnen geven tegenstrijdige premiebedragen. Stel de bedragen per medewerker (leeftijd) in op basis van de polis van de zorgverzekeraar.",
    components: ["HEALTH-EE", "HEALTH-ER", "DED004", "ER002"],
    evidence: [
      { source: "Overheid Suriname — Basiszorgverzekering", url: "https://gov.sr/thema/basiszorgverzekering/", kind: "OFFICIAL_EXCERPT", finding: "Iedere werkgever is verplicht minimaal 50% van de premie te betalen.", checkedAt: CHECKED },
      { source: "Uitvoeringsorgaan Basiszorg — Wet Nationale Basiszorgverzekering", url: "https://www.basiszorg.sr/index.php/basiszorgverzekering-2/wetnationalebasiszorgverzekering/", kind: "OFFICIAL_EXCERPT", finding: "Premies per leeftijd: SRD 55 (0–16), 75 (17–20), 165 (21–59), 240 (60+) — stand 2014.", checkedAt: CHECKED },
      { source: "Vertrekklaar — Zorg in Suriname", url: "https://vertrekklaar.nl/kennis/zorg-in-suriname", kind: "SECONDARY", finding: "Noemt veel hogere maandpremies (bijv. SRD 785 voor 21–40 jaar) — tegenstrijdig.", checkedAt: CHECKED },
    ],
    history: [],
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
