import "server-only";
import { getLocale, getTranslations } from "next-intl/server";
import { createFormat } from "@/lib/format";
import { isLocale, DEFAULT_LOCALE } from "@/i18n/config";

/** Translator (root namespace, full keys) and locale formatter for the current request. */
export async function getI18n() {
  const raw = await getLocale();
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const t = await getTranslations();
  return { t, f: createFormat(locale), locale };
}
