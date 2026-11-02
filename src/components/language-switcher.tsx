"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { LOCALES, LOCALE_LABELS } from "@/i18n/config";
import { setLocaleAction } from "@/app/actions/locale";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ variant = "light", className }: { variant?: "light" | "dark"; className?: string }) {
  const locale = useLocale();
  const t = useTranslations();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className={cn("inline-flex items-center gap-1.5 text-sm", variant === "dark" ? "text-white/70" : "text-muted-foreground", className)}>
      <Languages className="h-4 w-4" aria-hidden />
      <span className="sr-only">{t("language.label")}</span>
      <select
        value={locale}
        disabled={pending}
        aria-label={t("language.label")}
        onChange={(e) => {
          const next = e.target.value;
          start(async () => {
            await setLocaleAction(next);
            router.refresh();
          });
        }}
        className={cn(
          "cursor-pointer rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40",
          variant === "dark" ? "border-white/15 bg-white/5 text-white [&>option]:text-black" : "border-input bg-card text-foreground",
        )}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>{LOCALE_LABELS[l].flag} {LOCALE_LABELS[l].label}</option>
        ))}
      </select>
    </label>
  );
}
