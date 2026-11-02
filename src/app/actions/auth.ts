"use server";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { createSession, destroySession, setActiveCompany } from "@/lib/server/session";
import { getContext } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { seedCompanyDefaults } from "@/lib/server/company-setup";
import { formObject, handleError, UserError, type ActionState } from "@/lib/server/action";
import { rateLimit } from "@/lib/server/rate-limit";
import { assertActiveCurrency } from "@/lib/server/rates";
import { currencyField, passwordSchema } from "@/lib/validation";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from "@/i18n/config";

const loginSchema = z.object({
  email: z.email("validation.email").transform((e) => e.toLowerCase()),
  password: z.string({ error: "validation.required" }).min(1, "validation.required"),
});

// Used to equalise timing when the user does not exist.
const DUMMY_HASH = "$2b$12$/HJbsXLp4cbUoyNHG0/wKeAE3519qzWtotY9Gn0xdjxvYleN282L6";

async function clientIp() {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

/** Keeps the browser language cookie in sync with the account preference (used before sign-in). */
async function syncLocaleCookie(locale: string) {
  if (isLocale(locale)) (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let target = "/app";
  try {
    const t = await getTranslations();
    const data = loginSchema.parse(formObject(fd));
    const ip = await clientIp();
    if (!rateLimit(`login:${data.email}`, 8, 15 * 60_000) || !rateLimit(`login-ip:${ip}`, 30, 15 * 60_000)) {
      return { ok: false, message: t("auth.tooManyAttempts") };
    }
    const user = await db.user.findUnique({ where: { email: data.email }, include: { memberships: { orderBy: { createdAt: "asc" } } } });
    const valid = await bcrypt.compare(data.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid || !user.isActive) return { ok: false, message: t("auth.invalidLogin") };
    const first = user.memberships[0];
    await createSession(user.id, first?.companyId ?? null);
    await syncLocaleCookie(user.locale);
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit({ companyId: first?.companyId ?? null, userId: user.id, action: "auth.login", entity: "User", entityId: user.id });
    if (!first) target = "/onboarding";
    else if (first.role === "EMPLOYEE") target = "/me";
  } catch (e) {
    return handleError(e);
  }
  redirect(target);
}

const registerSchema = z.object({
  name: z.string({ error: "validation.required" }).min(2).max(120),
  email: z.email("validation.email").transform((e) => e.toLowerCase()),
  password: passwordSchema,
  organizationName: z.string({ error: "validation.required" }).min(2).max(160),
  companyName: z.string({ error: "validation.required" }).min(2).max(160),
  currency: currencyField,
});

export async function registerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const t = await getTranslations();
    const data = registerSchema.parse(formObject(fd));
    if (!rateLimit(`register:${await clientIp()}`, 10, 60 * 60_000)) return { ok: false, message: t("auth.tooManyRegistrations") };
    if (!(await assertActiveCurrency(data.currency))) throw new UserError("errors.currencyInactive", { code: data.currency });
    if (await db.user.findUnique({ where: { email: data.email } })) return { ok: false, message: t("auth.emailTaken"), errors: { email: [t("auth.alreadyRegistered")] } };
    const rawLocale = await getLocale();
    const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
    const passwordHash = await bcrypt.hash(data.password, 12);
    const { user, company } = await db.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email: data.email, name: data.name, passwordHash, locale } });
      const org = await tx.organization.create({ data: { name: data.organizationName } });
      const company = await tx.company.create({ data: { name: data.companyName, organizationId: org.id, currency: data.currency } });
      await tx.membership.create({ data: { userId: user.id, companyId: company.id, role: "OWNER" } });
      await seedCompanyDefaults(tx, company.id, locale);
      return { user, company };
    });
    await createSession(user.id, company.id);
    await audit({ companyId: company.id, userId: user.id, action: "auth.register", entity: "Company", entityId: company.id, details: { currency: data.currency } });
  } catch (e) {
    return handleError(e);
  }
  redirect("/app?welcome=1");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function switchCompanyAction(fd: FormData) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  const companyId = String(fd.get("companyId") ?? "");
  const m = ctx.memberships.find((x) => x.companyId === companyId);
  if (!m) redirect("/app");
  await setActiveCompany(ctx.session.id, companyId);
  redirect(m.role === "EMPLOYEE" ? "/me" : "/app");
}

const pwSchema = z.object({ current: z.string({ error: "validation.required" }).min(1, "validation.required"), next: passwordSchema });

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const t = await getTranslations();
    const ctx = await getContext();
    if (!ctx) throw new UserError("errors.notSignedIn");
    const data = pwSchema.parse(formObject(fd));
    if (!(await bcrypt.compare(data.current, ctx.user.passwordHash))) return { ok: false, message: t("auth.currentIncorrect"), errors: { current: [t("auth.incorrect")] } };
    await db.user.update({ where: { id: ctx.user.id }, data: { passwordHash: await bcrypt.hash(data.next, 12) } });
    await db.session.deleteMany({ where: { userId: ctx.user.id, NOT: { id: ctx.session.id } } });
    await audit({ companyId: ctx.company?.id ?? null, userId: ctx.user.id, action: "auth.password_changed", entity: "User", entityId: ctx.user.id });
    return { ok: true, message: t("auth.passwordChanged"), ts: Date.now() };
  } catch (e) {
    return handleError(e);
  }
}
