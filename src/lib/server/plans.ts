import "server-only";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { planHref, PLANS } from "@/lib/pricing";

export type PublicPlan = { code: string; name: string; description: string; price: number | null; currency: string; features: string[]; popular: boolean; href: string; cta: string };

/**
 * Plans shown on the website: the active, published plans of the subscription management, so a price or
 * description changed by an administrator appears immediately. Falls back to the default plans when none exist.
 */
export async function publishedPlans(locale: string): Promise<PublicPlan[]> {
  const t = await getTranslations();
  const rows = await db.plan.findMany({ where: { isActive: true, isPublished: true }, orderBy: { sortOrder: "asc" } });
  const en = locale === "en";
  const cta = (code: string, name: string, onRequest: boolean) => (onRequest ? t("pricing.ctaQuote") : t("pricing.ctaChoose", { plan: name }));
  if (rows.length > 0) {
    return rows.map((p) => {
      const name = en ? p.nameEn : p.nameNl;
      const onRequest = p.monthlyPrice == null;
      return {
        code: p.code, name, description: (en ? p.descriptionEn : p.descriptionNl) ?? "", price: p.monthlyPrice != null ? p.monthlyPrice / 100 : null, currency: p.currency,
        features: ((en ? p.featuresEn : p.featuresNl) as string[]) ?? [], popular: p.popular,
        href: onRequest ? `/contact?type=quote&plan=${p.code}` : `/register?plan=${p.code}`,
        cta: (t.has(`pricing.plans.${p.code}.cta` as never) ? t(`pricing.plans.${p.code}.cta` as never) : cta(p.code, name, onRequest)) as string,
      };
    });
  }
  return PLANS.map((p) => ({
    code: p.id, name: t(`pricing.plans.${p.id}.name`), description: t(`pricing.plans.${p.id}.employees`), price: p.priceSrd, currency: "SRD",
    features: Array.from({ length: p.features }, (_, i) => t(`pricing.plans.${p.id}.features.${i}` as never)), popular: !!p.popular, href: planHref(p), cta: t(`pricing.plans.${p.id}.cta`),
  }));
}
