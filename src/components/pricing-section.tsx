import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatPlanPrice, planHref, PLANS, TRIAL_DAYS } from "@/lib/pricing";

/** Pricing plans (from lib/pricing.ts) with calls to action that lead to registration or a demo/quote request. */
export async function PricingSection() {
  const t = await getTranslations();
  const locale = await getLocale();
  return (
    <section id="prijzen" aria-labelledby="pricing-title" className="scroll-mt-8 pt-24">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium uppercase tracking-[0.16em] text-[#4fb3ff]">{t("pricing.eyebrow")}</p>
        <h2 id="pricing-title" className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{t("pricing.title")}</h2>
        <p className="mt-4 text-white/70">{t("pricing.subtitle")}</p>
      </div>

      <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((p) => (
          <div
            key={p.id}
            data-testid={`plan-${p.id}`}
            className={cn(
              "relative flex flex-col rounded-2xl bg-white p-6 text-slate-900 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-xl",
              p.popular ? "ring-2 ring-[#4fb3ff] xl:-mt-3 xl:pb-9" : "ring-1 ring-white/10",
            )}
          >
            {p.popular && (
              <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#0B3D91] px-3 py-1 text-xs font-semibold text-white shadow">
                <Sparkles className="h-3.5 w-3.5" /> {t("pricing.popular")}
              </span>
            )}
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#0B3D91]">{t(`pricing.plans.${p.id}.name`)}</h3>
            <p className="mt-1 text-sm text-slate-500">{t(`pricing.plans.${p.id}.employees`)}</p>
            <div className="mt-5 flex items-baseline gap-1.5">
              {p.priceSrd != null ? (
                <>
                  <span className="text-3xl font-semibold tracking-tight text-slate-900">{formatPlanPrice(p.priceSrd, locale)}</span>
                  <span className="text-sm text-slate-500">{t("pricing.perMonth")}</span>
                </>
              ) : (
                <span className="text-2xl font-semibold tracking-tight text-slate-900">{t("pricing.onRequest")}</span>
              )}
            </div>
            <ul className="mt-6 flex-1 space-y-2.5 text-sm">
              {Array.from({ length: p.features }, (_, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#0B3D91]" aria-hidden="true" />
                  <span>{t(`pricing.plans.${p.id}.features.${i}` as never)}</span>
                </li>
              ))}
            </ul>
            <Link
              href={planHref(p)}
              className={cn(buttonVariants({ variant: p.popular ? "default" : "outline", size: "lg" }), "mt-7 w-full", !p.popular && "border-[#0B3D91]/30 text-[#0B3D91] hover:bg-[#0B3D91]/5")}
            >
              {t(`pricing.plans.${p.id}.cta`)}
            </Link>
          </div>
        ))}
      </div>

      <p className="mt-6 text-center text-xs text-white/50">{t("pricing.note")}</p>

      <div className="mt-10 flex flex-col items-center gap-3 text-center">
        <p className="text-white/75">{t("pricing.demoText")}</p>
        <Link href="/contact?type=demo" className={buttonVariants({ variant: "accent", size: "lg" })}>{t("pricing.demoCta")}</Link>
      </div>

      <div className="mt-12 flex flex-col items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.05] px-6 py-5 sm:flex-row" data-testid="trial-banner">
        <p className="text-center text-sm text-white/85 sm:text-left">{t("pricing.trial", { days: TRIAL_DAYS })}</p>
        <Link href="/register?trial=1" className={buttonVariants({ variant: "outline", className: "border-white/25 bg-transparent text-white hover:bg-white/10" })}>{t("pricing.trialCta")}</Link>
      </div>
    </section>
  );
}
