import { z } from "zod";
import { parseMoney } from "./format";

export const moneyField = z
  .string()
  .optional()
  .transform((v, ctx) => {
    try {
      const c = parseMoney(v);
      if (c < 0) throw new Error();
      return c;
    } catch {
      ctx.addIssue({ code: "custom", message: "Enter a valid amount" });
      return z.NEVER;
    }
  });

export const percentField = z
  .string()
  .optional()
  .transform((v, ctx) => {
    const n = v ? Number(v.replace(",", ".")) : 0;
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      ctx.addIssue({ code: "custom", message: "Enter a percentage between 0 and 100" });
      return z.NEVER;
    }
    return Math.round(n * 100);
  });

export const dateField = z.string({ error: "Required" }).regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").transform((s) => new Date(`${s}T00:00:00Z`));
export const optionalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").optional().transform((s) => (s ? new Date(`${s}T00:00:00Z`) : null));
export const optionalText = (max = 200) => z.string().max(max).optional().transform((v) => v ?? null);
export const numberField = (min = 0, max = 1000) => z.coerce.number().min(min).max(max);

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .regex(/[A-Za-z]/, "Include a letter")
  .regex(/[0-9]/, "Include a number");
