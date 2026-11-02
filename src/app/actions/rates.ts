"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getContext, requirePermission } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { assertActiveCurrency, getCurrencies, getProviderConfig } from "@/lib/server/rates";
import { fetchProviderRates } from "@/lib/rate-provider";
import { formObject, handleError, ok, UserError, type ActionState } from "@/lib/server/action";
import { currencyField, dateField, optionalText, rateField } from "@/lib/validation";

const rateSchema = z.object({
  baseCurrency: currencyField,
  quoteCurrency: currencyField,
  rate: rateField,
  effectiveDate: dateField,
  notes: optionalText(300),
});

async function validatePair(base: string, quote: string) {
  if (base === quote) throw new UserError("errors.sameCurrency");
  for (const code of [base, quote]) if (!(await assertActiveCurrency(code))) throw new UserError("errors.currencyInactive", { code });
}

/** Company rate entered manually. Approved immediately unless the company policy requires approval. */
export async function addRateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("payroll.run");
    const data = rateSchema.parse(formObject(fd));
    await validatePair(data.baseCurrency, data.quoteCurrency);
    const approved = !ctx.company.rateRequireApproval;
    const rec = await db.exchangeRate.create({
      data: {
        ...data, companyId: ctx.company.id, source: "MANUAL", createdById: ctx.user.id,
        status: approved ? "APPROVED" : "PENDING", ...(approved ? { approvedById: ctx.user.id, approvedAt: new Date() } : {}),
      },
    });
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "rate.create", entity: "ExchangeRate", entityId: rec.id, details: { pair: `${data.baseCurrency}/${data.quoteCurrency}`, rate: data.rate, effectiveDate: data.effectiveDate.toISOString().slice(0, 10), status: rec.status } });
    revalidatePath("/app/exchange-rates");
    const t = await getTranslations();
    return ok(approved ? t("rates.added") : t("rates.addedPending"));
  } catch (e) {
    return handleError(e);
  }
}

export async function decideRateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("payroll.approve");
    const decision = z.enum(["APPROVED", "REJECTED"]).parse(fd.get("decision"));
    const rate = await db.exchangeRate.findFirst({ where: { id: String(fd.get("id")), companyId: ctx.company.id } });
    if (!rate) throw new UserError("errors.notFound");
    if (rate.status !== "PENDING") throw new UserError("errors.rateNotPending");
    await db.exchangeRate.update({ where: { id: rate.id }, data: { status: decision, approvedById: ctx.user.id, approvedAt: new Date() } });
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: decision === "APPROVED" ? "rate.approve" : "rate.reject", entity: "ExchangeRate", entityId: rate.id, details: { pair: `${rate.baseCurrency}/${rate.quoteCurrency}`, rate: rate.rate.toString() } });
    revalidatePath("/app/exchange-rates");
    const t = await getTranslations();
    return ok(decision === "APPROVED" ? t("rates.approved") : t("rates.rejected"));
  } catch (e) {
    return handleError(e);
  }
}

async function fetchAndStore(companyId: string | null, base: string, userId: string, approve: boolean) {
  const cfg = await getProviderConfig();
  if (!cfg.enabled) throw new UserError("errors.providerDisabled");
  const quotes = (await getCurrencies()).map((c) => c.code);
  let fetched: { quote: string; rate: number }[];
  try {
    fetched = await fetchProviderRates(cfg, base, quotes);
  } catch (err) {
    const t = await getTranslations();
    return { ok: false, message: t("rates.fetchFailed", { error: err instanceof Error ? err.message : String(err) }), ts: Date.now() } as ActionState;
  }
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const data: Prisma.ExchangeRateCreateManyInput[] = fetched.map((r) => ({
    companyId, baseCurrency: base, quoteCurrency: r.quote, rate: r.rate.toFixed(10), effectiveDate: today,
    source: "API", provider: cfg.name, createdById: userId,
    status: approve ? "APPROVED" : "PENDING", ...(approve ? { approvedById: userId, approvedAt: new Date() } : {}),
  }));
  if (data.length) await db.exchangeRate.createMany({ data });
  await audit({ companyId, userId, action: "rate.fetch", entity: "ExchangeRate", details: { provider: cfg.name, base, count: data.length } });
  return { ok: true, message: (await getTranslations())("rates.fetched", { count: data.length }), ts: Date.now() } as ActionState;
}

export async function fetchCompanyRatesAction(): Promise<ActionState> {
  try {
    const ctx = await requirePermission("payroll.run");
    if (!ctx.company.rateAllowApi) throw new UserError("errors.apiNotAllowed");
    const res = await fetchAndStore(ctx.company.id, ctx.company.currency, ctx.user.id, !ctx.company.rateRequireApproval);
    revalidatePath("/app/exchange-rates");
    return res;
  } catch (e) {
    return handleError(e);
  }
}

// ── Platform administration ──────────────────────────────────────────────────

async function requirePlatformAdmin() {
  const ctx = await getContext();
  if (!ctx?.user.isPlatformAdmin) throw new UserError("errors.notPlatformAdmin");
  return ctx;
}

export async function addPlatformRateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePlatformAdmin();
    const data = rateSchema.parse(formObject(fd));
    await validatePair(data.baseCurrency, data.quoteCurrency);
    const rec = await db.exchangeRate.create({ data: { ...data, companyId: null, source: "MANUAL", status: "APPROVED", createdById: ctx.user.id, approvedById: ctx.user.id, approvedAt: new Date() } });
    await audit({ companyId: null, userId: ctx.user.id, action: "rate.platform_create", entity: "ExchangeRate", entityId: rec.id, details: { pair: `${data.baseCurrency}/${data.quoteCurrency}`, rate: data.rate } });
    revalidatePath("/app/admin");
    return ok((await getTranslations())("rates.added"));
  } catch (e) {
    return handleError(e);
  }
}

export async function fetchPlatformRatesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePlatformAdmin();
    const base = currencyField.parse(fd.get("baseCurrency"));
    // Platform API rates are approved records but companies only use them when their policy allows provider rates.
    const res = await fetchAndStore(null, base, ctx.user.id, true);
    revalidatePath("/app/admin");
    return res;
  } catch (e) {
    return handleError(e);
  }
}

export async function toggleCurrencyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePlatformAdmin();
    const code = currencyField.parse(fd.get("code"));
    const c = await db.currency.findUnique({ where: { code } });
    if (!c) throw new UserError("errors.notFound");
    await db.currency.update({ where: { code }, data: { isActive: !c.isActive } });
    await audit({ companyId: null, userId: ctx.user.id, action: c.isActive ? "currency.deactivate" : "currency.activate", entity: "Currency", entityId: code });
    revalidatePath("/app/admin");
    return ok((await getTranslations())("admin.currencyUpdated", { code }));
  } catch (e) {
    return handleError(e);
  }
}

export async function saveProviderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePlatformAdmin();
    const raw = formObject(fd);
    const data = z.object({
      name: z.string({ error: "validation.required" }).min(2).max(100),
      url: z.string({ error: "validation.required" }).url("validation.invalid").startsWith("https://", "validation.invalid").max(500),
      apiKey: z.string().max(200).optional(),
    }).parse(raw);
    const current = await getProviderConfig();
    const value = { enabled: raw.enabled === "on", name: data.name, url: data.url, apiKey: data.apiKey ?? current.apiKey };
    await db.platformSetting.upsert({ where: { key: "exchangeRateProvider" }, create: { key: "exchangeRateProvider", value }, update: { value } });
    await audit({ companyId: null, userId: ctx.user.id, action: "platform.provider_saved", entity: "PlatformSetting", entityId: "exchangeRateProvider", details: { enabled: value.enabled, name: value.name, url: value.url } });
    revalidatePath("/app/admin");
    return ok((await getTranslations())("admin.saved"));
  } catch (e) {
    return handleError(e);
  }
}
