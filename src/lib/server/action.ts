import "server-only";
import { z } from "zod";
import { AuthError } from "./auth";
import { PayrollError } from "@/lib/payroll/service";

export type ActionState = { ok: boolean; message?: string; errors?: Record<string, string[] | undefined>; ts?: number } | null;

export class UserError extends Error {}

/** Converts known error types into a form state; rethrows anything else (incl. Next.js redirects). */
export function handleError(err: unknown): ActionState {
  if (err instanceof z.ZodError) {
    return { ok: false, message: "Please correct the highlighted fields.", errors: z.flattenError(err).fieldErrors as Record<string, string[]>, ts: Date.now() };
  }
  if (err instanceof AuthError || err instanceof PayrollError || err instanceof UserError) {
    return { ok: false, message: err.message, ts: Date.now() };
  }
  if (typeof err === "object" && err && "code" in err && (err as { code: string }).code === "P2002") {
    return { ok: false, message: "A record with these details already exists.", ts: Date.now() };
  }
  throw err;
}

export const ok = (message: string): ActionState => ({ ok: true, message, ts: Date.now() });

/** FormData → plain object (empty strings become undefined). */
export function formObject(fd: FormData) {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v === "string") out[k] = v.trim() === "" ? undefined : v.trim();
  }
  return out;
}
