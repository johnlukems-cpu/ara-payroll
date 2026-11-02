import Link from "next/link";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/ui/misc";
import { LanguageSwitcher } from "@/components/language-switcher";

export async function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode }) {
  const t = await getTranslations();
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-[radial-gradient(ellipse_at_top_left,_#0a3a8a_0%,_#011a3f_65%)] p-10 text-white lg:flex">
        <Link href="/"><Logo light size="lg" /></Link>
        <div>
          <Image src="/brand/ara-payroll-icon.png" alt="" width={72} height={72} className="mb-6 rounded-2xl shadow-lg" />
          <p className="max-w-md text-3xl font-semibold leading-snug tracking-tight">{t("auth.heroTitle")}</p>
          <p className="mt-2 text-lg text-white/80">{t("brand.tagline")}</p>
          <p className="mt-4 max-w-md text-white/55">{t("auth.heroSub")}</p>
        </div>
        <p className="text-xs text-white/40">{t("brand.product")} — {t("brand.developedBy")}</p>
      </div>
      <div className="flex flex-col p-6">
        <div className="flex justify-end"><LanguageSwitcher /></div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-md">
            <div className="mb-8 lg:hidden"><Logo /></div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            <div className="mt-8">{children}</div>
            <div className="mt-6 text-sm text-muted-foreground">{footer}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
