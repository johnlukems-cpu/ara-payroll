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
import { createCustomer, saasSettings } from "@/lib/server/saas";
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
    if (!user || !valid || !user.isActive) {
      // A registration still awaiting approval: tell the applicant instead of a generic error (password checked).
      const pending = !user ? await db.contactRequest.findFirst({ where: { email: data.email, type: "REGISTRATION", status: { in: ["NEW", "IN_REVIEW", "INFO_REQUESTED", "DEMO_SCHEDULED", "APPROVED"] } } }) : null;
      if (pending?.passwordHash && (await bcrypt.compare(data.password, pending.passwordHash))) return { ok: false, message: t("auth.registrationPending") };
      return { ok: false, message: t("auth.invalidLogin") };
    }
    const first = user.memberships[0];
    await createSession(user.id, first?.companyId ?? null);
    await syncLocaleCookie(user.locale);
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit({ companyId: first?.companyId ?? null, userId: user.id, action: "auth.login", entity: "User", entityId: user.id });
    if (!first) target = user.platformRole || user.isPlatformAdmin ? "/admin" : "/onboarding";
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
  phone: z.string().max(40).optional(),
  plan: z.string().max(30).optional(),
});

export async function registerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let submitted = false;
  try {
    const t = await getTranslations();
    const data = registerSchema.parse(formObject(fd));
    if (!rateLimit(`register:${await clientIp()}`, 10, 60 * 60_000)) return { ok: false, message: t("auth.tooManyRegistrations") };
    if (!(await assertActiveCurrency(data.currency))) throw new UserError("errors.currencyInactive", { code: data.currency });
    if (await db.user.findUnique({ where: { email: data.email } })) return { ok: false, message: t("auth.emailTaken"), errors: { email: [t("auth.alreadyRegistered")] } };
    const rawLocale = await getLocale();
    const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
    const passwordHash = await bcrypt.hash(data.password, 12);
    const plan = (await db.plan.findFirst({ where: { code: data.plan ?? "starter", isActive: true } })) ?? (await db.plan.findFirst({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }));
    const settings = await saasSettings();
    if (settings.registrationMode === "APPROVAL") {
      // Registration becomes a request; the account is created by an ARA administrator after approval.
      const open = await db.contactRequest.findFirst({ where: { email: data.email, type: "REGISTRATION", status: { notIn: ["CONVERTED", "REJECTED"] } } });
      if (open) return { ok: false, message: t("auth.registrationAlreadyPending") };
      await db.contactRequest.create({
        data: { type: "REGISTRATION", plan: plan?.code ?? null, name: data.name, company: data.companyName, organizationName: data.organizationName, email: data.email, phone: data.phone ?? null, currency: data.currency, passwordHash, locale },
      });
      submitted = true;
    } else {
      if (!plan) throw new UserError("saasErrors.planInactive");
      const res = await createCustomer({ organizationName: data.organizationName, companyName: data.companyName, currency: data.currency, locale, owner: { name: data.name, email: data.email, passwordHash }, contact: { phone: data.phone ?? null }, planCode: plan.code, trial: true, userId: null });
      await db.contactRequest.create({ data: { type: "REGISTRATION", plan: plan.code, name: data.name, company: data.companyName, organizationName: data.organizationName, email: data.email, phone: data.phone ?? null, currency: data.currency, locale, status: "CONVERTED", handled: true, decidedAt: new Date(), organizationId: res.org.id } });
      await createSession(res.user.id, res.company.id);
      await audit({ companyId: res.company.id, userId: res.user.id, action: "auth.register", entity: "Company", entityId: res.company.id, details: { currency: data.currency, plan: plan.code } });
    }
  } catch (e) {
    return handleError(e);
  }
  redirect(submitted ? "/register?submitted=1" : "/app?welcome=1");
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
