export const LOCALES = ["nl", "en"] as const;
export type Locale = (typeof LOCALES)[number];
/** Dutch is the default language for new users and visitors. */
export const DEFAULT_LOCALE: Locale = "nl";
export const LOCALE_COOKIE = "ARA_LOCALE";

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);

/** BCP 47 tags used for number/date formatting. */
export const INTL_LOCALE: Record<Locale, string> = { nl: "nl-SR", en: "en-GB" };

export const LOCALE_LABELS: Record<Locale, { label: string; flag: string }> = {
  nl: { label: "Nederlands", flag: "🇸🇷" },
  en: { label: "English", flag: "🇬🇧" },
};
