import "server-only";
import type { Permission } from "@/lib/permissions";
import { AuthError, requirePermission } from "./auth";

/** Runs a route handler body with a permission check, mapping auth failures to HTTP errors. */
export async function withPermission(permission: Permission, fn: (ctx: Awaited<ReturnType<typeof requirePermission>>) => Promise<Response>) {
  try {
    const ctx = await requirePermission(permission);
    return await fn(ctx);
  } catch (e) {
    if (e instanceof AuthError) return new Response("Forbidden", { status: 403 });
    throw e;
  }
}

export const notFound = () => new Response("Not found", { status: 404 });
