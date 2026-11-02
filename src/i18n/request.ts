import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { getContext } from "@/lib/server/auth";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from "./config";

/**
 * Resolves the UI language for a request:
 * signed-in user's saved preference → browser cookie (visitors) → Dutch.
 */
export default getRequestConfig(async () => {
  const ctx = await getContext().catch(() => null);
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(ctx?.user.locale) ? ctx.user.locale : isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone: "America/Paramaribo",
  };
});
