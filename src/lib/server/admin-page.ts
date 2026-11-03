import "server-only";
import { redirect } from "next/navigation";
import { requireUser } from "./auth";
import { isSaasAdmin, isSuperAdmin } from "./saas";

/** Pages of the ARA administration portal: SaaS or super administrators only (server-side check on every page). */
export async function requireAdminPage(level: "SAAS" | "SUPER" = "SAAS") {
  const ctx = await requireUser();
  const allowed = level === "SUPER" ? isSuperAdmin(ctx.user) : isSaasAdmin(ctx.user);
  if (!allowed) redirect(isSaasAdmin(ctx.user) ? "/admin?denied=1" : "/app?denied=1");
  return { ...ctx, isSuper: isSuperAdmin(ctx.user) };
}
