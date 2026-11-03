/**
 * Default pricing plans (seed and fallback). The website shows the published plans from the subscription
 * management (Plan table, ARA administration portal → Abonnementen); this list is only used when none exist.
 * Texts (name, features, buttons) of these defaults live in messages/*.json under "pricing.plans.<id>".
 * Prices are monthly amounts in whole SRD (excl. any taxes); null = price on request.
 */
export type PlanId = "starter" | "business" | "professional" | "enterprise";

export interface Plan {
  id: PlanId;
  priceSrd: number | null;
  /** Number of feature lines in messages: pricing.plans.<id>.features.0 … n-1 */
  features: number;
  popular?: boolean;
  /** Where the plan's button leads: registration (self-service start) or a quote request. */
  cta: "register" | "quote";
}

export const PLANS: Plan[] = [
  { id: "starter", priceSrd: 750, features: 5, cta: "register" },
  { id: "business", priceSrd: 1500, features: 6, cta: "register", popular: true },
  { id: "professional", priceSrd: 2750, features: 6, cta: "register" },
  { id: "enterprise", priceSrd: null, features: 5, cta: "quote" },
];

export const TRIAL_DAYS = 30;

export const isPlanId = (v: string | undefined | null): v is PlanId => PLANS.some((p) => p.id === v);

/** "SRD 1.500" (nl) / "SRD 1,500" (en): whole amounts, no decimals. */
export const formatPlanPrice = (amount: number, locale: string, currency = "SRD") =>
  `${currency} ${new Intl.NumberFormat(locale === "en" ? "en-GB" : "nl-NL", { maximumFractionDigits: 0 }).format(amount)}`;

/** Link behind a plan's button: always existing, working pages. */
export const planHref = (p: Plan) => (p.cta === "quote" ? `/contact?type=quote&plan=${p.id}` : `/register?plan=${p.id}`);
