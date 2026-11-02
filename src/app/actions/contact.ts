"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/server/rate-limit";
import { formObject, handleError, ok, type ActionState } from "@/lib/server/action";
import { AuthError, getContext } from "@/lib/server/auth";
import { isPlanId } from "@/lib/pricing";
import { revalidatePath } from "next/cache";

const schema = z.object({
  type: z.enum(["DEMO", "QUOTE"]),
  plan: z.string().optional(),
  name: z.string({ error: "validation.required" }).trim().min(2, "validation.required").max(100),
  company: z.string({ error: "validation.required" }).trim().min(2, "validation.required").max(120),
  email: z.email("validation.email").max(160).transform((v) => v.toLowerCase()),
  phone: z.string().max(40).optional(),
  employees: z.string().optional().transform((v) => (v ? Number(v) : null)).pipe(z.number({ error: "validation.invalid" }).int().min(1).max(100_000).nullable()),
  message: z.string().max(2000).optional(),
  website: z.string().optional(), // honeypot: must stay empty
});

/** Stores a demo or quote request from the website (rate-limited, with a honeypot against bots). */
export async function submitContactAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const t = await getTranslations();
    const d = schema.parse(formObject(fd));
    if (d.website) return ok(t("contact.thanks")); // silently ignore bots
    const h = await headers();
    const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
    if (!rateLimit(`contact:${ip}`, 5, 60 * 60_000)) return { ok: false, message: t("contact.tooMany"), ts: Date.now() };
    await db.contactRequest.create({
      data: {
        type: d.type, plan: isPlanId(d.plan) ? d.plan : null, name: d.name, company: d.company, email: d.email,
        phone: d.phone || null, employees: d.employees, message: d.message || null, locale: await getLocale(),
      },
    });
    return ok(t(d.type === "DEMO" ? "contact.thanksDemo" : "contact.thanksQuote"));
  } catch (e) {
    return handleError(e);
  }
}

/** Platform administrators mark website requests as handled. */
export async function markContactHandledAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await getContext();
    if (!ctx?.user.isPlatformAdmin) throw new AuthError("errors.forbidden");
    await db.contactRequest.update({ where: { id: String(fd.get("id")) }, data: { handled: true } });
    revalidatePath("/app/admin");
    return ok((await getTranslations())("contact.markedHandled"));
  } catch (e) {
    return handleError(e);
  }
}
