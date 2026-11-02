# ARA Payroll — Legal research & outstanding verification (Suriname)

> **Status: research draft — not legal advice.** Every statutory rule in ARA Payroll is marked
> `PENDING_VERIFICATION` (or `CONFLICT`) until a qualified Surinamese tax professional confirms it
> for the relevant period. Payroll calculated with unverified rules is flagged “pending legal validation”
> and can only be approved with an explicit, audited acknowledgement.

Research date: November 2026. The official sites (belastingdienst.sr, sris.sr, gov.sr) could not be opened
directly from the build environment; findings come from search-engine extracts of those documents and
from the primary source supplied by ARA Intelligent Solutions (S.B. 2024 no. 2). **Read the full texts
before activating any rule.**

## 1. Loonbelasting (wage tax)

| Item | Implemented value | Source | Status |
|---|---|---|---|
| Professional expense deduction (beroepskosten) | SRD 4,800 / year (SRD 400 / month), fixed amount | S.B. 2024 no. 2, art. 12 (supplied primary source). A secondary summary describes it as 4% capped at SRD 4,800 — for wages above SRD 10,000/month both give SRD 400 | Pending verification |
| Tax-free amount (belastingvrije som) | SRD 108,000 / year (SRD 9,000 / month). Annual and monthly amounts are stored separately and never applied cumulatively | S.B. 2024 no. 2, art. 13; Wet Loonbelasting text on belastingdienst.sr | Pending verification |
| Progressive rates (art. 14) | 8% up to SRD 42,000; 18% to 84,000; 28% to 126,000; 38% above — on the taxable wage after the tax-free amount | S.B. 2024 no. 2, art. 14; tax.sr | Pending verification |
| Separate rate structure (art. 17a lid 2) | 5% / 15% / 25% / 35% on the same bands — **separate regime, not applied to anyone** until its legal scope is verified | S.B. 2024 no. 2, art. 17a lid 2 | Pending verification — scope unknown |
| Heffingskorting | **None** (the first release used SRD 750/month — withdrawn) | S.B. 2022 no. 149: “verwerking van de heffingskorting in de belastingvrije som” | Pending verification |
| Special rewards (vakantiegeld, bonus, gratificatie) exemption | SRD 10,016 / year in the S.B. 2024 rule set | S.B. 2025 no. 101 raised it to SRD 19,500 (retroactive to 1 Jan 2025) **but S.B. 2025 no. 129 (29 Oct 2025) withdrew no. 101** — content of no. 129 not available | **Conflict** |
| Overtime tax brackets | 5% to SRD 2,500; 15% to 7,500; 25% above (per month) | S.B. 2025 no. 101 (withdrawn); the rate above SRD 7,500 was not confirmed | **Conflict** |
| Child allowance exemption | SRD 125 per child per month, max. 4 children | No current source found | Pending verification |
| Calculation method | Annualised: (monthly net wage × 12 − tax-free amount) → brackets → ÷ 12. Optional monthly-table method with monthly equivalents | Method choice to be confirmed | Pending verification |

**Do not assume S.B. 2024 no. 2 is the latest legislation for 2026.** Check S.B. 2025 no. 129, any 2026
decrees under art. 18a, and Belastingdienst instructions.

## 2. AOV (Algemene Oudedagsvoorziening)

| Item | Implemented | Source | Status |
|---|---|---|---|
| Rate | 4% of the assessment base | Wet AOV | Pending verification |
| Base | Net wage (zuiver loon) when wage tax is due — implemented as regular net wage after deductible pension and the professional expense deduction, plus overtime and the taxable part of special rewards | Wet AOV | Interpretation — pending verification |
| Franchise / minimum / maximum | None (configurable) | No franchise found | Pending verification |
| Who pays | Withheld from the employee (100% employee share; employer share configurable) | Wet AOV: levied by withholding on wages | Pending verification |
| Age limit | No premium from age 60 | Wet AOV: residents who have not reached 60 | Pending verification |
| Filing | Combined monthly return “loonbelasting en premie AOV” via the online portal since 2024 | belastingdienst.sr | Pending verification |

ARA Payroll keeps AOV as its own rule set and reports it separately (AOV report), while the declaration file
follows the combined official return.

## 3. Parental leave (Wet Arbeidsbescherming Gezin, S.B. 2019 no. 64)

| Leave | Researched entitlement | Status |
|---|---|---|
| Maternity (zwangerschaps- en bevallingsverlof) | Max. 16 weeks (24 for triplets or more): 4–6 weeks before, 10–12 weeks after birth | Pending verification |
| Paternity (vaderschapsverlof) | Sources report 8 days (ministry), 7 days, or minimum 5 days | **Conflict** |
| Adoption | 6 weeks paid for the adoptive mother, child under 18 months | Pending verification |
| General parental leave (ouderschapsverlof) | No separate statutory rule found — company policy | Company policy |
| Payment | Reported as fully paid via a fund (FVO), funded by a 1% contribution of gross wage (split employer/employee) — **not verified**; no contribution is calculated by default | Pending verification |

Payroll only adjusts salary according to the **approved policy** of each leave type (`payPercent`, default 100%).

## 4. Declarations and submission

- Monthly return for loonbelasting and AOV premium, online portal `portaal.belastingdienst.sr`; reported
  filing window: 26th of the month to the 10th of the following month (deadline default: 10th, configurable).
- Annual summary (verzamelloonstaat) filed online — deadline not verified (default 31 January).
- **No official API, electronic declaration format or authorised import mechanism was found.** ARA Payroll
  therefore generates PDF/Excel/CSV files, and the user submits manually and records date, reference and receipt.
  ARA Payroll never logs in to government portals and never simulates submission.

## 5. Sources

- Wet Loonbelasting (consolidated text): https://belastingdienst.sr/wp-content/uploads/2024/10/Wet-Loonbelasting.pdf
- S.B. 2024 no. 2: https://www.sris.sr/wp-content/uploads/2024/01/S.B.-2024-no.-2-STAATSBESLUIT-11-januari-2024-uitvoeringartikel-18a-Wet-Loonbelasting-S.B.-1981-no.-181-laatstelijk-gewijzigd-S.B.pdf
- S.B. 2022 no. 149: https://www.sris.sr/wp-content/uploads/2023/01/S.B.-2022-no.-149-wijziging-van-de-Wet-Loonbelasting.pdf
- S.B. 2025 no. 101: https://www.sris.sr/wp-content/uploads/2025/07/S.B.-2025-no.-101-STAATSBESLUIT-van-22-juli-2025-ter-uitvoering-van-artikel-18a-van-de-Wet-Loonbelasting.pdf
- S.B. 2025 no. 129: https://www.sris.sr/wp-content/uploads/2025/11/S.B.-2025-no.-129-STAATSBESLUIT-ter-uitvoering-van-artikel-18a-van-de-Wet-Loonbelasting.pdf
- Wet AOV: https://belastingdienst.sr/wp-content/uploads/2024/10/Wet-AOV.pdf
- Loonbelasting – aangifte: https://belastingdienst.sr/belastingen/loonbelasting/aangifte/
- Wet Arbeidsbescherming Gezin (S.B. 2019 no. 64): https://gov.sr/wp-content/uploads/2022/09/wet-arbeidsbescherming-gezin-bescherming-moederschap.pdf
- Ministry statement on 16 weeks maternity leave: https://gov.sr/werkgevers-verplicht-tot-16-weken-zwangerschaps-en-bevallingsverlof/
- Secondary: tax.sr calculator (https://www.tax.sr/loonbelasting-berekening), HBN Law & Tax summaries of the July 2025 decree.

## 6. Activation checklist

1. A tax professional reviews each rule set under **Tax & Declarations → Tax rules / AOV rules** against the full texts.
2. Create a company version where values differ, then **Mark verified** with a “verified until” date and the reviewer.
3. Resolve the conflicts above (S.B. 2025 no. 101/129; paternity leave duration; FVO contribution).
4. Decide whether art. 17a applies to any employees; only then can employees be linked to that regime.
5. Re-verify whenever a new decree is published — periods after “verified until” automatically return to “pending legal validation”.
