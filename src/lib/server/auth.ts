import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role, SupportAccess } from "@prisma/client";
import { accessFor, type Access } from "@/lib/saas";
import { db } from "@/lib/db";
import { can, type Permission } from "@/lib/permissions";
import { readSession } from "./session";

export class AuthError extends Error {
  constructor(public key: "errors.unauthenticated" | "errors.forbidden" | "errors.subscriptionBlocked") {
    super(key);
  }
}

const superAdmin = (u: { platformRole: string | null; isPlatformAdmin: boolean }) => u.platformRole === "SUPER_ADMIN" || u.isPlatformAdmin;

/**
 * Resolves the signed-in user, their memberships and the active company for this request.
 * - A super administrator with an active, logged support session gets a temporary READ-ONLY (accountant)
 *   membership for that one company — never ownership, and never without a session.
 * - `access` reflects the customer's subscription status (blocked customers cannot use the payroll application).
 */
export const getContext = cache(async () => {
  const session = await readSession();
  if (!session) return null;
  const now = new Date();
  const memberships: (Awaited<ReturnType<typeof db.membership.findMany<{ include: { company: true } }>>>[number] & { support?: SupportAccess | null })[] = await db.membership.findMany({
    where: { userId: session.userId },
    include: { company: true },
    orderBy: { company: { name: "asc" } },
  });
  if (superAdmin(session.user)) {
    const supports = await db.supportAccess.findMany({ where: { adminUserId: session.userId, endedAt: null, expiresAt: { gt: now } }, orderBy: { startedAt: "desc" } });
    for (const s of supports) {
      if (memberships.some((m) => m.companyId === s.companyId)) continue;
      const company = await db.company.findUnique({ where: { id: s.companyId } });
      if (company) memberships.push({ id: `support-${s.id}`, userId: session.userId, companyId: s.companyId, role: "ACCOUNTANT", createdAt: s.startedAt, company, support: s });
    }
  }
  const active = memberships.find((m) => m.companyId === session.activeCompanyId) ?? memberships.find((m) => !m.support) ?? memberships[0] ?? null;
  let access: Access = { level: "OK", reason: "NO_SUBSCRIPTION" };
  if (active && !active.support) {
    const [org, sub] = await Promise.all([
      db.organization.findUnique({ where: { id: active.company.organizationId }, select: { status: true } }),
      db.subscription.findFirst({ where: { organizationId: active.company.organizationId }, orderBy: { createdAt: "desc" } }),
    ]);
    access = accessFor(org?.status ?? "ACTIVE", sub, now);
  }
  return {
    session,
    user: session.user,
    memberships,
    company: active?.company ?? null,
    role: (active?.role ?? null) as Role | null,
    support: active?.support ?? null,
    access,
  };
});

export type AppContext = NonNullable<Awaited<ReturnType<typeof getContext>>>;

/** For pages: redirects to login when unauthenticated. */
export async function requireUser() {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/** For pages: requires a company and a permission (redirects instead of throwing). */
export async function requirePage(permission?: Permission) {
  const ctx = await requireUser();
  if (!ctx.company || !ctx.role) redirect("/onboarding");
  if (ctx.access.level === "BLOCKED") redirect("/subscription");
  if (ctx.role === "EMPLOYEE" && permission) redirect("/me");
  if (permission && !can(ctx.role, permission)) redirect("/app?denied=1");
  return ctx as AppContext & { company: NonNullable<AppContext["company"]>; role: Role };
}

/** For server actions and route handlers: throws on missing permission. */
export async function requirePermission(permission: Permission) {
  const ctx = await getContext();
  if (!ctx || !ctx.company || !ctx.role) throw new AuthError("errors.unauthenticated");
  if (ctx.access.level === "BLOCKED") throw new AuthError("errors.subscriptionBlocked");
  if (!can(ctx.role, permission)) throw new AuthError("errors.forbidden");
  return ctx as AppContext & { company: NonNullable<AppContext["company"]>; role: Role };
}
