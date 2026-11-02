"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, destroySession, setActiveCompany } from "@/lib/server/session";
import { getContext } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { seedCompanyDefaults } from "@/lib/server/company-setup";
import { formObject, handleError, type ActionState } from "@/lib/server/action";
import { rateLimit } from "@/lib/server/rate-limit";
import { passwordSchema } from "@/lib/validation";

const loginSchema = z.object({ email: z.email("Enter a valid email").transform((e) => e.toLowerCase()), password: z.string().min(1, "Required") });

// Used to equalise timing when the user does not exist.
const DUMMY_HASH = "$2b$12$/HJbsXLp4cbUoyNHG0/wKeAE3519qzWtotY9Gn0xdjxvYleN282L6";

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let target = "/app";
  try {
    const data = loginSchema.parse(formObject(fd));
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (!rateLimit(`login:${data.email}`, 8, 15 * 60_000) || !rateLimit(`login-ip:${ip}`, 30, 15 * 60_000)) {
      return { ok: false, message: "Too many sign-in attempts. Please wait 15 minutes and try again." };
    }
    const user = await db.user.findUnique({ where: { email: data.email }, include: { memberships: { orderBy: { createdAt: "asc" } } } });
    const valid = await bcrypt.compare(data.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid || !user.isActive) return { ok: false, message: "Invalid email or password." };
    const first = user.memberships[0];
    await createSession(user.id, first?.companyId ?? null);
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
  name: z.string().min(2, "Enter your full name").max(120),
  email: z.email("Enter a valid email").transform((e) => e.toLowerCase()),
  password: passwordSchema,
  organizationName: z.string().min(2, "Enter your organisation name").max(160),
  companyName: z.string().min(2, "Enter the company name").max(160),
});

export async function registerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const data = registerSchema.parse(formObject(fd));
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (!rateLimit(`register:${ip}`, 10, 60 * 60_000)) return { ok: false, message: "Too many registrations from this address. Try again later." };
    if (await db.user.findUnique({ where: { email: data.email } })) return { ok: false, message: "An account with this email already exists.", errors: { email: ["Already registered"] } };
    const passwordHash = await bcrypt.hash(data.password, 12);
    const { user, company } = await db.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email: data.email, name: data.name, passwordHash } });
      const org = await tx.organization.create({ data: { name: data.organizationName } });
      const company = await tx.company.create({ data: { name: data.companyName, organizationId: org.id } });
      await tx.membership.create({ data: { userId: user.id, companyId: company.id, role: "OWNER" } });
      await seedCompanyDefaults(tx, company.id);
      return { user, company };
    });
    await createSession(user.id, company.id);
    await audit({ companyId: company.id, userId: user.id, action: "auth.register", entity: "Company", entityId: company.id });
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

const pwSchema = z.object({ current: z.string().min(1, "Required"), next: passwordSchema });

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await getContext();
    if (!ctx) return { ok: false, message: "Not signed in" };
    const data = pwSchema.parse(formObject(fd));
    if (!(await bcrypt.compare(data.current, ctx.user.passwordHash))) return { ok: false, message: "Current password is incorrect.", errors: { current: ["Incorrect"] } };
    await db.user.update({ where: { id: ctx.user.id }, data: { passwordHash: await bcrypt.hash(data.next, 12) } });
    // Invalidate all other sessions.
    await db.session.deleteMany({ where: { userId: ctx.user.id, NOT: { id: ctx.session.id } } });
    await audit({ companyId: ctx.company?.id ?? null, userId: ctx.user.id, action: "auth.password_changed", entity: "User", entityId: ctx.user.id });
    return { ok: true, message: "Password updated. Other sessions have been signed out.", ts: Date.now() };
  } catch (e) {
    return handleError(e);
  }
}
