"use server";

import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getContext } from "@/lib/server/auth";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";

/** Saves the UI language: on the user account (all devices) and in a cookie (also for visitors). */
export async function setLocaleAction(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: false });
  const ctx = await getContext();
  if (ctx) await db.user.update({ where: { id: ctx.user.id }, data: { locale } });
}
