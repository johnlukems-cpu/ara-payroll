import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { can, type Permission } from "@/lib/permissions";
import { readSession } from "./session";

export class AuthError extends Error {}

/** Resolves the signed-in user, their memberships and the active company for this request. */
export const getContext = cache(async () => {
  const session = await readSession();
  if (!session) return null;
  const memberships = await db.membership.findMany({
    where: { userId: session.userId },
    include: { company: true },
    orderBy: { company: { name: "asc" } },
  });
  const active = memberships.find((m) => m.companyId === session.activeCompanyId) ?? memberships[0] ?? null;
  return {
    session,
    user: session.user,
    memberships,
    company: active?.company ?? null,
    role: (active?.role ?? null) as Role | null,
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
  if (ctx.role === "EMPLOYEE" && permission) redirect("/me");
  if (permission && !can(ctx.role, permission)) redirect("/app?denied=1");
  return ctx as AppContext & { company: NonNullable<AppContext["company"]>; role: Role };
}

/** For server actions and route handlers: throws on missing permission. */
export async function requirePermission(permission: Permission) {
  const ctx = await getContext();
  if (!ctx || !ctx.company || !ctx.role) throw new AuthError("Not authenticated");
  if (!can(ctx.role, permission)) throw new AuthError("You do not have permission to perform this action");
  return ctx as AppContext & { company: NonNullable<AppContext["company"]>; role: Role };
}
