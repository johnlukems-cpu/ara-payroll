/**
 * Central payroll component library (ARA Payroll standard chart of pay components).
 * Source of truth for the ComponentLibrary table (inserted by migration) and for adopting
 * components into a company. System entries are calculated by the payroll engine itself.
 *
 * Tax treatment, AOV and pension flags are defaults: statutory tax-free status of individual
 * allowances has NOT been verified, so non-system entries are COMPANY_POLICY unless stated.
 */
export type LibraryEntry = {
  code: string;
  category: "SALARY" | "ALLOWANCE" | "OVERTIME" | "BONUS" | "DEDUCTION" | "EMPLOYER" | "LEAVE";
  kind: "ALLOWANCE" | "DEDUCTION" | "EMPLOYER";
  nameNl: string;
  nameEn: string;
  calcType?: "FIXED" | "PERCENT_OF_BASE" | "PERCENT_OF_COMPONENT" | "HOURS_X_RATE" | "DAYS_X_RATE" | "QTY_X_PRICE" | "FORMULA" | "MANUAL";
  taxTreatment?: "TAXABLE" | "EXEMPT" | "EXEMPT_UP_TO_LIMIT" | "CHILD_ALLOWANCE" | "SPECIAL_REWARD" | "OVERTIME";
  multiplierBp?: number;
  aovIncluded?: boolean;
  pensionIncluded?: boolean;
  netEffect?: "ADD" | "DEDUCT" | "NONE";
  employerCost?: boolean;
  preTax?: boolean;
  frequency?: "RECURRING" | "ONE_OFF" | "ANNUAL";
  isSystem?: boolean;
  systemCode?: string;
  legalStatus?: "VERIFIED" | "PENDING_VERIFICATION" | "CONFLICT" | "COMPANY_POLICY";
  legalReference?: string;
};

const sal = (code: string, nameNl: string, nameEn: string, o: Partial<LibraryEntry> = {}): LibraryEntry => ({ code, category: "SALARY", kind: "ALLOWANCE", nameNl, nameEn, pensionIncluded: true, ...o });
const alw = (code: string, nameNl: string, nameEn: string, o: Partial<LibraryEntry> = {}): LibraryEntry => ({ code, category: "ALLOWANCE", kind: "ALLOWANCE", nameNl, nameEn, ...o });
const ovt = (code: string, nameNl: string, nameEn: string, o: Partial<LibraryEntry> = {}): LibraryEntry => ({ code, category: "OVERTIME", kind: "ALLOWANCE", nameNl, nameEn, calcType: "HOURS_X_RATE", taxTreatment: "OVERTIME", frequency: "ONE_OFF", legalStatus: "PENDING_VERIFICATION", ...o });
const bon = (code: string, nameNl: string, nameEn: string, o: Partial<LibraryEntry> = {}): LibraryEntry => ({ code, category: "BONUS", kind: "ALLOWANCE", nameNl, nameEn, taxTreatment: "SPECIAL_REWARD", frequency: "ONE_OFF", legalReference: "Wet Loonbelasting — bijzondere beloningen (vrijstelling: zie belastingregels)", ...o });
const ded = (code: string, nameNl: string, nameEn: string, o: Partial<LibraryEntry> = {}): LibraryEntry => ({ code, category: "DEDUCTION", kind: "DEDUCTION", nameNl, nameEn, netEffect: "DEDUCT", employerCost: false, aovIncluded: false, ...o });
const er = (code: string, nameNl: string, nameEn: string, o: Partial<LibraryEntry> = {}): LibraryEntry => ({ code, category: "EMPLOYER", kind: "EMPLOYER", nameNl, nameEn, netEffect: "NONE", employerCost: true, aovIncluded: false, ...o });
const lev = (code: string, nameNl: string, nameEn: string, o: Partial<LibraryEntry> = {}): LibraryEntry => ({ code, category: "LEAVE", kind: "ALLOWANCE", nameNl, nameEn, isSystem: true, netEffect: "NONE", ...o });

export const COMPONENT_LIBRARY: LibraryEntry[] = [
  // 1.1 Salary
  sal("SAL001", "Bruto maandsalaris", "Gross monthly salary", { isSystem: true, systemCode: "SAL001" }),
  sal("SAL002", "Bruto weeksalaris", "Gross weekly salary", { isSystem: true, systemCode: "SAL002" }),
  sal("SAL003", "Bruto dagloon", "Gross daily wage", { isSystem: true, systemCode: "SAL003" }),
  sal("SAL004", "Bruto uurloon", "Gross hourly wage", { isSystem: true, systemCode: "SAL004" }),
  sal("SAL005", "Minimumloonaanpassing", "Minimum wage adjustment"),
  sal("SAL006", "Salarisverhoging", "Salary increase"),
  sal("SAL007", "Retroactief salaris", "Retroactive salary", { calcType: "MANUAL", frequency: "ONE_OFF", legalStatus: "PENDING_VERIFICATION", legalReference: "Fiscale behandeling van nabetalingen niet geverifieerd" }),
  sal("SAL008", "Pro-rata salaris", "Pro-rata salary", { isSystem: true, systemCode: "SAL008" }),
  // 1.2 Allowances and reimbursements
  alw("ALW001", "Transportvergoeding", "Transportation allowance"),
  alw("ALW002", "Telefoonvergoeding", "Telephone allowance"),
  alw("ALW003", "Internetvergoeding", "Internet allowance"),
  alw("ALW004", "Maaltijdvergoeding", "Meal allowance"),
  alw("ALW005", "Huisvestingsvergoeding", "Housing allowance"),
  alw("ALW006", "Representatievergoeding", "Representation allowance"),
  alw("ALW007", "Kledingvergoeding", "Clothing allowance"),
  alw("ALW008", "Functietoeslag", "Position allowance", { pensionIncluded: true }),
  alw("ALW009", "Verantwoordelijkheidstoeslag", "Responsibility allowance", { pensionIncluded: true }),
  alw("ALW010", "Gevarentoeslag", "Hazard allowance"),
  alw("ALW011", "Ploegentoeslag", "Shift allowance"),
  alw("ALW012", "Overige vergoeding", "Other allowance", { calcType: "MANUAL", frequency: "ONE_OFF" }),
  alw("ALW013", "Brandstoftoelage", "Fuel allowance"),
  alw("ALW014", "Koerscompensatie", "Exchange rate compensation", { legalReference: "Fiscale behandeling van koerscompensatie niet geverifieerd" }),
  // 1.3 Overtime and special working hours (percentages configurable; link to legislation or CAO)
  ovt("OVT001", "Overwerk 150%", "Overtime 150%", { multiplierBp: 15000, isSystem: true, systemCode: "OT1" }),
  ovt("OVT002", "Overwerk 200%", "Overtime 200%", { multiplierBp: 20000, isSystem: true, systemCode: "OT2" }),
  ovt("OVT003", "Overwerk 250%", "Overtime 250%", { multiplierBp: 25000 }),
  ovt("OVT004", "Werk op vrije dag", "Work on rest day"),
  ovt("OVT005", "Werk op feestdag", "Public holiday work"),
  ovt("OVT006", "Nachttoeslag", "Night shift allowance", { taxTreatment: "TAXABLE", multiplierBp: 0 }),
  ovt("OVT007", "Zondagtoeslag", "Sunday allowance", { taxTreatment: "TAXABLE", multiplierBp: 0 }),
  ovt("OVT008", "Extra gewerkte uren", "Additional working hours", { taxTreatment: "TAXABLE" }),
  // 1.4 Bonuses and special payments (bijzondere beloningen)
  bon("BON001", "Prestatiebonus", "Performance bonus"),
  bon("BON002", "Productiviteitsbonus", "Productivity bonus"),
  bon("BON003", "Commissie", "Commission", { taxTreatment: "TAXABLE", frequency: "RECURRING", legalReference: undefined }),
  bon("BON004", "Kerstbonus", "Christmas bonus"),
  bon("BON005", "Jaarbonus", "Annual bonus", { frequency: "ANNUAL" }),
  bon("BON006", "Vakantietoelage", "Holiday allowance", { frequency: "ANNUAL" }),
  bon("BON007", "Gratificatie", "Gratuity"),
  bon("BON008", "Eenmalige bonus", "One-time bonus"),
  bon("BON009", "Winstuitkering", "Profit sharing", { frequency: "ANNUAL" }),
  bon("BON010", "Retentiebonus", "Retention bonus"),
  // 1.5 Employee deductions
  ded("DED001", "Loonbelasting", "Payroll tax", { isSystem: true, systemCode: "LB", legalStatus: "PENDING_VERIFICATION", legalReference: "Wet Loonbelasting (S.B. 1981 no. 181, zoals gewijzigd); S.B. 2024 no. 2" }),
  ded("DED002", "Werknemersbijdrage pensioen", "Employee pension contribution", { isSystem: true, systemCode: "PENS", preTax: true }),
  ded("DED003", "Sociale verzekering", "Social insurance", { calcType: "PERCENT_OF_BASE", legalStatus: "PENDING_VERIFICATION", legalReference: "Grondslag/verplichting niet geverifieerd (o.a. FVO-bijdrage ouderschapsverlof)" }),
  ded("DED004", "Ziektekostenverzekering", "Health insurance"),
  ded("DED005", "Salarisvoorschot", "Salary advance", { calcType: "MANUAL", frequency: "ONE_OFF" }),
  ded("DED006", "Personeelslening", "Employee loan"),
  ded("DED007", "Vakbondsbijdrage", "Union contribution"),
  ded("DED008", "Overige inhoudingen", "Other deductions", { calcType: "MANUAL", frequency: "ONE_OFF" }),
  ded("DED009", "Correctie vorige periode", "Previous period adjustment", { calcType: "MANUAL", frequency: "ONE_OFF" }),
  ded("DED010", "Onbetaald verlof", "Unpaid leave", { isSystem: true, systemCode: "UNPAID" }),
  ded("DED012", "FVO-bijdrage", "FVO contribution", { calcType: "PERCENT_OF_BASE", legalStatus: "PENDING_VERIFICATION", legalReference: "Fonds ouderschapsverlof (Wet Arbeidsbescherming Gezin) — percentage en verdeling werkgever/werknemer niet geverifieerd" }),
  ded("DED013", "Pensioenbijdrage (vast bedrag)", "Pension contribution (fixed amount)", { preTax: true, legalReference: "Alleen gebruiken als er geen pensioenpercentage in de arbeidsovereenkomst staat" }),
  ded("DED011", "AOV-premie", "AOV premium", { isSystem: true, systemCode: "AOV", legalStatus: "PENDING_VERIFICATION", legalReference: "Wet AOV — premie 4% van de heffingsgrondslag" }),
  // 1.6 Employer contributions (never deducted from net salary)
  er("ER001", "Werkgeversbijdrage pensioen", "Employer pension contribution", { isSystem: true, systemCode: "PENS-ER" }),
  er("ER002", "Werkgeversbijdrage ziektekosten", "Employer health contribution"),
  er("ER003", "Werkgeversbijdrage sociale verzekering", "Employer social insurance contribution", { calcType: "PERCENT_OF_BASE", legalStatus: "PENDING_VERIFICATION" }),
  er("ER004", "Werkgeversbijdrage overige verzekeringen", "Other employer insurance contributions"),
  er("ER005", "Overige werkgeverslasten", "Other employer costs"),
  er("ER006", "AOV werkgeversdeel", "AOV employer share", { isSystem: true, systemCode: "AOV-ER", legalStatus: "PENDING_VERIFICATION" }),
  // 1.7 Leave and absence (payroll lines generated from approved leave)
  lev("LEV001", "Jaarlijks verlof", "Annual leave"),
  lev("LEV002", "Ziekteverlof", "Sick leave"),
  lev("LEV003", "Bijzonder verlof", "Special leave"),
  lev("LEV004", "Onbetaald verlof", "Unpaid leave"),
  lev("LEV005", "Feestdagen", "Public holidays"),
  lev("LEV006", "Ouderschapsverlof", "Parental leave", { legalStatus: "PENDING_VERIFICATION" }),
  lev("LEV007", "Zwangerschapsverlof", "Maternity leave", { legalStatus: "PENDING_VERIFICATION", legalReference: "Wet Arbeidsbescherming Gezin, S.B. 2019 no. 64" }),
  lev("LEV008", "Vaderschapsverlof", "Paternity leave", { legalStatus: "CONFLICT", legalReference: "Wet Arbeidsbescherming Gezin, S.B. 2019 no. 64 — duur volgens bronnen 5, 7 of 8 dagen" }),
  lev("LEV009", "Adoptieverlof", "Adoption leave", { legalStatus: "PENDING_VERIFICATION", legalReference: "Wet Arbeidsbescherming Gezin, S.B. 2019 no. 64" }),
  lev("LEV010", "Afwezigheid zonder toestemming", "Unauthorized absence"),
];

export const SYSTEM_CODES = new Set(COMPONENT_LIBRARY.filter((c) => c.isSystem).map((c) => c.code));

/** Engine line code → library code, so every payslip line traces back to a library component. */
export const LINE_TO_LIBRARY: Record<string, string> = {
  BASE: "SAL001", SAL001: "SAL001", SAL002: "SAL002", SAL003: "SAL003", SAL004: "SAL004",
  OT1: "OVT001", OT2: "OVT002", LB: "DED001", "LB-BB": "DED001", "LB-OT": "DED001",
  AOV: "DED011", "AOV-ER": "ER006", PENS: "DED002", "PENS-ER": "ER001", UNPAID: "DED010",
};

export const LEAVE_CATEGORY_COMPONENT: Record<string, string> = {
  ANNUAL: "LEV001", SICK: "LEV002", SPECIAL: "LEV003", UNPAID: "LEV004", PUBLIC_HOLIDAY: "LEV005",
  PARENTAL: "LEV006", MATERNITY: "LEV007", PATERNITY: "LEV008", ADOPTION: "LEV009", UNAUTHORIZED: "LEV010",
};

/** Defaults applied when a library entry is adopted into a company. */
export function libraryDefaults(e: LibraryEntry) {
  return {
    calcType: e.calcType ?? "FIXED",
    taxTreatment: e.taxTreatment ?? (e.kind === "ALLOWANCE" ? "TAXABLE" : "TAXABLE"),
    multiplierBp: e.multiplierBp ?? 10000,
    aovIncluded: e.aovIncluded ?? e.kind === "ALLOWANCE",
    pensionIncluded: e.pensionIncluded ?? false,
    netEffect: e.netEffect ?? (e.kind === "ALLOWANCE" ? "ADD" : e.kind === "DEDUCTION" ? "DEDUCT" : "NONE"),
    employerCost: e.employerCost ?? e.kind !== "DEDUCTION",
    preTax: e.preTax ?? false,
    frequency: e.frequency ?? "RECURRING",
    legalStatus: e.legalStatus ?? "COMPANY_POLICY",
  } as const;
}
