import { z } from "zod";
import { parseMoney } from "./format";
import { parseRate } from "./currency";

// Custom messages are translation keys, resolved in handleError (lib/server/action.ts).

export const moneyField = z
  .string()
  .optional()
  .transform((v, ctx) => {
    try {
      const c = parseMoney(v);
      if (c < 0) throw new Error();
      return c;
    } catch {
      ctx.addIssue({ code: "custom", message: "validation.amount" });
      return z.NEVER;
    }
  });

export const percentField = z
  .string()
  .optional()
  .transform((v, ctx) => {
    const n = v ? Number(v.replace(",", ".")) : 0;
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      ctx.addIssue({ code: "custom", message: "validation.percent" });
      return z.NEVER;
    }
    return Math.round(n * 100);
  });

export const rateField = z.string({ error: "validation.required" }).transform((v, ctx) => {
  const r = parseRate(v);
  if (!r) {
    ctx.addIssue({ code: "custom", message: "validation.rate" });
    return z.NEVER;
  }
  return r;
});

export const currencyField = z.string({ error: "validation.required" }).regex(/^[A-Z]{3}$/, "validation.currency");
export const dateField = z.string({ error: "validation.required" }).regex(/^\d{4}-\d{2}-\d{2}$/, "validation.date").transform((s) => new Date(`${s}T00:00:00Z`));
export const optionalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "validation.date").optional().transform((s) => (s ? new Date(`${s}T00:00:00Z`) : null));
export const optionalText = (max = 200) => z.string().max(max).optional().transform((v) => v ?? null);
export const numberField = (min = 0, max = 1000) => z.coerce.number().min(min).max(max);

export const passwordSchema = z
  .string({ error: "validation.required" })
  .min(10, "validation.passwordLength")
  .regex(/[A-Za-z]/, "validation.passwordLetter")
  .regex(/[0-9]/, "validation.passwordNumber");
