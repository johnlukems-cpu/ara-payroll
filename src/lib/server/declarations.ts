import "server-only";
import type { Declaration, DeclarationStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { aggregateDeclaration, payable, type DeclarationSnapshot, type SlipForDeclaration } from "@/lib/declarations/aggregate";
import { annualDeadline, monthlyDeadline, nextStatus, type DeclarationAction } from "@/lib/declarations/status";
import { generateDeclarationFiles } from "@/lib/declarations/files";
import { createFormat } from "@/lib/format";
import { audit } from "./audit";
import { UserError } from "./errors";
import type { Locale } from "@/i18n/config";

/** Finalized payroll for a period (approved or paid runs), in declaration form. */
async function loadSlips(companyId: string, year: number, month: number | null): Promise<SlipForDeclaration[]> {
  const slips = await db.payslip.findMany({
    where: { run: { companyId, year, ...(month ? { month } : {}), status: { in: ["APPROVED", "PAID"] } } },
    include: { lines: { select: { code: true, amount: true } }, employee: { select: { idNumber: true } }, run: { select: { month: true, taxRuleSet: { select: { name: true } }, aovRuleSet: { select: { name: true } } } } },
  });
  return slips.map((s) => ({
    employeeId: s.employeeId, employeeNumber: s.employeeNumber, employeeName: s.employeeName, idNumber: s.employee.idNumber,
    month: s.run.month, runId: s.runId, calcCurrency: s.calcCurrency, grossPay: s.grossPay, taxableWage: s.taxableWage,
    wageTax: s.wageTax, aov: s.aov, aovEmployer: s.aovEmployer, aovBaseAmount: s.aovBaseAmount, legalStatus: s.legalStatus,
    lines: s.lines, taxRuleSet: s.run.taxRuleSet?.name ?? (s.trace as { ruleSet?: string })?.ruleSet ?? null,
    aovRuleSet: s.run.aovRuleSet?.name ?? (s.trace as { aovRuleSet?: string })?.aovRuleSet ?? null,
  }));
}

async function snapshotFor(companyId: string, year: number, month: number) {
  const company = await db.company.findUniqueOrThrow({ where: { id: companyId } });
  const slips = await loadSlips(companyId, year, month || null);
  return { company, snapshot: aggregateDeclaration({ name: company.name, legalName: company.legalName, kkfNumber: company.kkfNumber, taxNumber: company.taxNumber, address: company.address, district: company.district }, { year, month }, slips) };
}

const totalsData = (s: DeclarationSnapshot, previousAdjustments: number) => ({
  snapshot: s as unknown as Prisma.InputJsonValue,
  currency: s.currency,
  employeeCount: s.totals.employeeCount,
  totalTaxable: s.totals.taxable,
  totalWageTax: s.totals.wageTax,
  totalAov: s.totals.aov + s.totals.aovEmployer,
  totalPayable: payable(s, previousAdjustments),
  legalPending: s.legalPending,
  runIds: s.runIds,
});

async function event(declarationId: string, fromStatus: DeclarationStatus | null, toStatus: DeclarationStatus, userId: string | null, note?: string) {
  await db.declarationEvent.create({ data: { declarationId, fromStatus, toStatus, userId, note } });
}

/**
 * Automatic preparation after payroll is approved: creates or refreshes the monthly LB/AOV draft.
 * Declarations already approved (or further) are never changed — corrections go through a supplementary declaration.
 */
export async function prepareMonthlyDeclaration(companyId: string, year: number, month: number, userId: string | null) {
  const company = await db.company.findUniqueOrThrow({ where: { id: companyId } });
  const existing = await db.declaration.findFirst({ where: { companyId, type: "LB_AOV_MONTHLY", year, month }, orderBy: { version: "desc" } });
  if (existing && !["IN_PREPARATION", "CALCULATED", "UNDER_REVIEW"].includes(existing.status)) return { declaration: existing, created: false, locked: true };
  const { snapshot } = await snapshotFor(companyId, year, month);
  if (existing) {
    const d = await db.declaration.update({ where: { id: existing.id }, data: { ...totalsData(snapshot, existing.previousAdjustments), status: "CALCULATED" } });
    if (existing.status !== "CALCULATED") await event(d.id, existing.status, "CALCULATED", userId, "auto");
    return { declaration: d, created: false, locked: false };
  }
  const d = await db.declaration.create({
    data: { companyId, type: "LB_AOV_MONTHLY", year, month, status: "CALCULATED", deadline: monthlyDeadline(year, month, company.declarationDueDay), ...totalsData(snapshot, 0) },
  });
  await event(d.id, null, "CALCULATED", userId, "auto");
  await db.notification.create({ data: { companyId, type: "declaration.draft", params: { year, month }, link: `/app/tax/declarations/${d.id}` } });
  await audit({ companyId, userId, action: "declaration.prepared", entity: "Declaration", entityId: d.id, details: { year, month, totalPayable: d.totalPayable } });
  return { declaration: d, created: true, locked: false };
}

/** Annual summary (verzamelloonstaat) prepared on request. */
export async function prepareAnnualDeclaration(companyId: string, year: number, userId: string) {
  const existing = await db.declaration.findFirst({ where: { companyId, type: "VERZAMELLOONSTAAT", year, month: 0 }, orderBy: { version: "desc" } });
  if (existing && !["IN_PREPARATION", "CALCULATED", "UNDER_REVIEW"].includes(existing.status)) throw new UserError("errors.declarationLocked");
  const { snapshot } = await snapshotFor(companyId, year, 0);
  if (existing) {
    const d = await db.declaration.update({ where: { id: existing.id }, data: { ...totalsData(snapshot, existing.previousAdjustments), status: "CALCULATED" } });
    await event(d.id, existing.status, "CALCULATED", userId);
    return d;
  }
  const d = await db.declaration.create({ data: { companyId, type: "VERZAMELLOONSTAAT", year, month: 0, status: "CALCULATED", deadline: annualDeadline(year), ...totalsData(snapshot, 0) } });
  await event(d.id, null, "CALCULATED", userId);
  await audit({ companyId, userId, action: "declaration.prepared", entity: "Declaration", entityId: d.id, details: { year, type: "VERZAMELLOONSTAAT" } });
  return d;
}

/** Reopening approved payroll is only possible while its declaration has not been approved. */
export async function assertPeriodReopenable(companyId: string, year: number, month: number) {
  const locked = await db.declaration.findFirst({ where: { companyId, type: "LB_AOV_MONTHLY", year, month, status: { notIn: ["IN_PREPARATION", "CALCULATED", "UNDER_REVIEW"] } } });
  if (locked) throw new UserError("errors.declarationLocked");
  await db.declaration.updateMany({ where: { companyId, type: "LB_AOV_MONTHLY", year, month }, data: { status: "IN_PREPARATION" } });
}

export async function loadDeclaration(companyId: string, id: string) {
  const d = await db.declaration.findFirst({ where: { id, companyId } });
  if (!d) throw new UserError("errors.notFound");
  return d;
}

/** Applies a status transition with an event record and audit entry. */
export async function transition(d: Declaration, action: DeclarationAction, userId: string, data: Prisma.DeclarationUpdateInput = {}, note?: string) {
  const to = nextStatus(d.status, action);
  if (!to) throw new UserError("errors.declarationTransition", { status: d.status });
  const updated = await db.declaration.update({ where: { id: d.id }, data: { ...data, status: to } });
  if (to !== d.status) await event(d.id, d.status, to, userId, note);
  await audit({ companyId: d.companyId, userId, action: `declaration.${action}`, entity: "Declaration", entityId: d.id, details: { from: d.status, to, note: note ?? null } });
  return updated;
}

export async function recalculateDeclaration(d: Declaration, userId: string) {
  const { snapshot } = await snapshotFor(d.companyId, d.year, d.month);
  return transition(d, "recalculate", userId, totalsData(snapshot, d.previousAdjustments));
}

/** Generates and stores all declaration files from the approved snapshot. */
export async function generateFiles(d: Declaration, userId: string, locale: Locale, t: (k: string, v?: Record<string, string | number>) => string) {
  if (!nextStatus(d.status, "generate")) throw new UserError("errors.declarationTransition", { status: d.status });
  const snapshot = d.snapshot as unknown as DeclarationSnapshot;
  const files = await generateDeclarationFiles(snapshot, { type: d.type, version: d.version, deadline: d.deadline, previousAdjustments: d.previousAdjustments, totalPayable: d.totalPayable, status: nextStatus(d.status, "generate")!, legalPending: d.legalPending }, t, createFormat(locale));
  await db.$transaction([
    db.declarationFile.deleteMany({ where: { declarationId: d.id } }),
    ...files.map((f) => db.declarationFile.create({ data: { declarationId: d.id, kind: f.kind, format: f.format, fileName: f.fileName, mimeType: f.mimeType, content: new Uint8Array(f.content), size: f.content.length, generatedById: userId } })),
  ]);
  return transition(d, "generate", userId, {}, `${files.length} files (${locale})`);
}

/** Supplementary (corrective) declaration: re-aggregates the period; the amount payable is the difference with earlier versions. */
export async function createSupplementary(d: Declaration, userId: string) {
  if (!nextStatus(d.status, "createSupplementary")) throw new UserError("errors.declarationTransition", { status: d.status });
  const latest = await db.declaration.findFirst({ where: { companyId: d.companyId, type: d.type, year: d.year, month: d.month }, orderBy: { version: "desc" } });
  if (latest && latest.id !== d.id) throw new UserError("errors.supplementaryExists");
  const { snapshot } = await snapshotFor(d.companyId, d.year, d.month);
  const declaredBefore = (await db.declaration.findMany({ where: { companyId: d.companyId, type: d.type, year: d.year, month: d.month, status: { in: ["SUBMITTED", "ACCEPTED", "PAID"] } } })).reduce((s, x) => s + x.totalPayable, 0);
  const difference = payable(snapshot) - declaredBefore;
  const s = await db.declaration.create({
    data: {
      companyId: d.companyId, type: d.type, year: d.year, month: d.month, version: d.version + 1, supplementaryOfId: d.id, status: "CALCULATED", deadline: d.deadline,
      ...totalsData(snapshot, 0), previousAdjustments: -declaredBefore, totalPayable: difference,
    },
  });
  await event(s.id, null, "CALCULATED", userId, `supplementary to v${d.version}`);
  await audit({ companyId: d.companyId, userId, action: "declaration.supplementary", entity: "Declaration", entityId: s.id, details: { of: d.id, difference } });
  return s;
}
