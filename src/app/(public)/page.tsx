import Link from "next/link";
import { CalendarCheck2, Coins, FileText, Landmark, ShieldCheck, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/ui/misc";
import { buttonVariants } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";

const features = [
  { icon: Users, key: "employees" },
  { icon: Landmark, key: "engine" },
  { icon: Coins, key: "multicurrency" },
  { icon: FileText, key: "payslips" },
  { icon: CalendarCheck2, key: "leave" },
  { icon: ShieldCheck, key: "security" },
] as const;

export default async function Landing() {
  const t = await getTranslations();
  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#0a3a8a_0%,_#011a3f_60%)] text-white">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6">
        <Logo light />
        <nav className="flex items-center gap-4">
          <LanguageSwitcher variant="dark" />
          <Link href="/login" className="text-sm text-white/80 hover:text-white">{t("landing.signIn")}</Link>
          <Link href="/register" className={buttonVariants({ variant: "accent" })}>{t("landing.startFree")}</Link>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-24 pt-12">
        <div className="max-w-3xl">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs tracking-wide text-white/75">{t("landing.badge")}</p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">{t("landing.title")}</h1>
          <p className="mt-5 max-w-2xl text-lg text-white/70">{t("landing.subtitle")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register" className={buttonVariants({ variant: "accent", size: "lg" })}>{t("landing.cta")}</Link>
            <Link href="/login" className={buttonVariants({ variant: "outline", size: "lg", className: "border-white/25 bg-transparent text-white hover:bg-white/10" })}>{t("landing.signIn")}</Link>
          </div>
        </div>
        <div className="mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.key} className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur">
              <f.icon className="h-6 w-6 text-[#4fb3ff]" />
              <h3 className="mt-4 font-semibold">{t(`landing.features.${f.key}.title`)}</h3>
              <p className="mt-2 text-sm text-white/65">{t(`landing.features.${f.key}.text`)}</p>
            </div>
          ))}
        </div>
      </main>
      <footer className="border-t border-white/10 py-8 text-center text-xs text-white/50">
        {t("brand.product")} · {t("brand.developedBy")} · {t("brand.ecosystem")}
      </footer>
    </div>
  );
}
