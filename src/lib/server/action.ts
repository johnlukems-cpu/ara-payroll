import "server-only";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { AuthError } from "./auth";
import { PayrollError } from "@/lib/payroll/service";
import { MissingRateError } from "@/lib/currency";

export type ActionState = { ok: boolean; message?: string; errors?: Record<string, string[] | undefined>; ts?: number } | null;

import { UserError } from "./errors";

export { UserError };

/** Zod issue → translated message. Schemas use translation keys (validation namespace) as custom messages. */
function issueMessage(t: Awaited<ReturnType<typeof getTranslations>>, issue: z.core.$ZodIssue) {
  if (issue.message?.startsWith("validation.")) return t(issue.message as never);
  switch (issue.code) {
    case "invalid_type":
      return t("validation.required");
    case "too_small":
      return issue.origin === "string" ? t("validation.tooShort", { min: Number(issue.minimum) }) : t("validation.tooSmall", { min: Number(issue.minimum) });
    case "too_big":
      return issue.origin === "string" ? t("validation.tooLong", { max: Number(issue.maximum) }) : t("validation.tooBig", { max: Number(issue.maximum) });
    case "invalid_format":
      return issue.format === "email" ? t("validation.email") : t("validation.invalid");
    default:
      return t("validation.invalid");
  }
}

/** Converts known error types into a translated form state; rethrows anything else (incl. Next.js redirects). */
export async function handleError(err: unknown): Promise<ActionState> {
  const ts = Date.now();
  if (err instanceof z.ZodError) {
    const t = await getTranslations();
    const errors: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const field = String(issue.path[0] ?? "_");
      (errors[field] ??= []).push(issueMessage(t, issue));
    }
    return { ok: false, message: t("validation.fixFields"), errors, ts };
  }
  if (err instanceof UserError || err instanceof PayrollError || err instanceof AuthError) {
    const t = await getTranslations();
    // Values written as "@key|row" are themselves translation keys (used for nested messages).
    const values: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(("values" in err ? err.values : undefined) ?? {})) {
      if (typeof v === "string" && v.startsWith("@")) {
        const [key, row] = v.slice(1).split("|");
        values[k] = t(key as never, (row ? { row: Number(row) } : {}) as never);
      } else values[k] = v;
    }
    return { ok: false, message: t(err.key as never, values as never), ts };
  }
  if (err instanceof MissingRateError) {
    const t = await getTranslations();
    return { ok: false, message: t("errors.missingRates", { pairs: `${err.from}→${err.to}` }), ts };
  }
  if (typeof err === "object" && err && "code" in err && (err as { code: string }).code === "P2002") {
    const t = await getTranslations();
    return { ok: false, message: t("errors.duplicate"), ts };
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
