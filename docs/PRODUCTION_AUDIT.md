# Production Readiness Audit — ARA Payroll (2 november 2026)

Uitgevoerd op commit `fa9ae70` (productie op Vercel: deployment geslaagd volgens GitHub-status) en de fixes in de daaropvolgende commit.

## Uitgevoerde tests
| Soort | Resultaat |
| --- | --- |
| Unit (Vitest) | 81/81 geslaagd |
| Integratie (PostgreSQL) | 26/26 geslaagd |
| End-to-end (Playwright, NL + EN) | 6/6 geslaagd |
| Lint / typecheck / productiebuild | geslaagd |
| Migraties vanaf lege database + `migrate diff` | geslaagd, schema = migraties, seed idempotent |
| PDF-stresstest (34 regels, 10 valutaconversies) | geslaagd na fix (vervolgpagina) |
| Mobiel (iPhone 13, 390 px) | alle hoofdpagina's passen na fix |
| `npm audit --omit=dev` | 3 high / 9 moderate in build-tool en exceljs-afhankelijkheden (zie risico's) |

## Opgeloste fouten (vóór uitrol)
1. **Kritiek — goedkeuring met verouderde cijfers.** Wijzigingen in contract, verlof, wisselkoers, belastingregels of componenten zetten een berekende run niet terug. Goedkeuren herberekent nu eerst en weigert als er iets veranderd is; goedkeuring is een conditionele update; `calculateRun` vergrendelt de run-rij.
2. **Hoog — autorisatie.** HR-managers (geen inzage in salarissen) konden via serveracties contracten en vaste looncomponenten wijzigen. Nu is `employees.viewSalary` vereist.
3. **Hoog — AOV-grondslag.** Het vinkje "Telt mee voor de AOV-grondslag" had geen effect bij de actieve AOV-regeling (grondslag belastbaar loon). Uitsluiting wordt nu toegepast en vastgelegd in de berekening; de UI waarschuwt.
4. **Hoog — opbouw bij uitdiensttreding.** Opgebouwde vakantietoelage werd niet uitbetaald bij ontslag; nu in de maand van uitdiensttreding.
5. **Hoog — aanpassing naar 0.** Een vast bedrag op 0 zetten voor één loonstrook viel terug op het standaardbedrag van de component.
6. **Middel — aanpassing in uitbetalingsmaand opbouw** telde het opgebouwde saldo er nog bij op; de aanpassing is nu het totaal.
7. **Middel — historie.** Verwijderen van een vaste component die in een goedgekeurde run zat, verwijderde ook de bijbehorende aanpassingshistorie; nu geblokkeerd (einddatum/inactief gebruiken).
8. **Middel — PDF-overloop** bij veel regels/conversies (tekst over de voettekst of buiten de pagina).
9. **Laag — mobiel**: componentenbibliotheek liep 53 px buiten beeld; kop van de loonstrookpagina werd samengeperst.

## Beveiligingsrisico's (resterend)
- Geen Content-Security-Policy-header (overige headers aanwezig: HSTS, X-Frame-Options, nosniff, Referrer-/Permissions-Policy).
- `npm audit`: `deepmerge-ts` via de Prisma-CLI (alleen build-time) en `uuid`/`minimatch`/`archiver` via exceljs (geen onvertrouwde invoer). Oplossing vereist Prisma 7 / exceljs-upgrade.
- HR-managers kunnen bij het aanmaken van een werknemer het startsalaris invoeren (bewuste keuze; wel zonder latere inzage).
- Gebruikers met `payroll.run` kunnen bibliotheekcomponenten aan het bedrijf toevoegen door ze te kiezen (geen instellingen wijzigen).

## Ontbrekende functionaliteiten / beperkingen
- Wettelijke regels (loonbelasting S.B. 2024 no. 2, AOV, kinderbijslag- en bonusvrijstelling, FVO) zijn **niet juridisch geverifieerd voor 2026**; runs krijgen status "wettelijke validatie in behandeling" en goedkeuring vereist een expliciete bevestiging.
- Opbouw (vakantietoelage) is gebaseerd op berekende loonstroken; maanden vóór ingebruikname tellen niet mee (geen beginsaldo-invoer).
- "Jaarlijks + % van basissalaris" rekent over één maandsalaris (hint in de UI); "Opbouw" voor % van jaarsalaris.
- Geen directe controle van de productieomgeving mogelijk vanuit de auditomgeving (netwerkbeleid); beoordeeld via de Vercel-deploystatus.

## Aanbevolen verbeteringen
1. Juridische verificatie van alle regels door een Surinaamse fiscalist; daarna status op VERIFIED zetten.
2. CSP-header toevoegen; Prisma 7 en exceljs-upgrade plannen.
3. Beginsaldo voor opbouw (migratie vanuit vorige administratie).
4. Waarschuwing als een "% van andere component" naar een component verwijst die de medewerker niet heeft.
5. Monitoring/foutrapportage (bijv. Sentry) en een periodieke database-back-uptest op productie.
6. Rapport "opgebouwde maar niet uitbetaalde vakantietoelage" voor de jaarafsluiting/balans.

## Oordeel
**READY FOR PRODUCTION** — alle kritieke en hoge fouten zijn opgelost en getest. Voorwaarde voor het uitbetalen van echte salarissen blijft de juridische verificatie van de wettelijke regels; de applicatie dwingt dit af met de status "wettelijke validatie in behandeling" en een vastgelegde bevestiging bij goedkeuring.
