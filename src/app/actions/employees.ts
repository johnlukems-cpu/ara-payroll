"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { AuthError, requirePermission } from "@/lib/server/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/server/audit";
import { storage } from "@/lib/server/storage";
import { formObject, handleError, ok, UserError, type ActionState } from "@/lib/server/action";
import { assertActiveCurrency } from "@/lib/server/rates";
import { assertNoFixedDuplicate, assertPensionNotDouble, parseOverrides, recalcOpenRuns, resolveComponent } from "@/lib/server/pay-components";
import { calculateRun } from "@/lib/payroll/service";
import { parseMoney } from "@/lib/format";
import { currencyField, dateField, moneyField, numberField, optionalDate, optionalText, percentField } from "@/lib/validation";

const employeeSchema = z.object({
  employeeNumber: z.string({ error: "validation.required" }).min(1, "validation.required").max(30),
  firstName: z.string({ error: "validation.required" }).min(1, "validation.required").max(80),
  lastName: z.string({ error: "validation.required" }).min(1, "validation.required").max(80),
  idNumber: optionalText(40),
  dateOfBirth: optionalDate,
  gender: optionalText(20),
  maritalStatus: optionalText(30),
  numberOfChildren: numberField(0, 30).default(0),
  email: z.email("validation.email").optional().transform((v) => v?.toLowerCase() ?? null),
  phone: optionalText(40),
  address: optionalText(200),
  district: optionalText(40),
  bankName: optionalText(80),
  bankAccount: optionalText(40),
  paymentCurrency: z.string().regex(/^[A-Z]{3}$/, "validation.currency").optional().transform((v) => v ?? null),
  taxRegime: z.enum(["STANDARD", "ART17A"]).default("STANDARD"),
  departmentId: optionalText(40),
  jobTitle: optionalText(100),
  hireDate: dateField,
});

const contractSchema = z.object({
  contractType: z.enum(["PERMANENT", "FIXED_TERM", "TEMPORARY", "PROBATION"]),
  payType: z.enum(["MONTHLY", "WEEKLY", "DAILY", "HOURLY"]),
  salaryCurrency: currencyField,
  startDate: dateField,
  endDate: optionalDate,
  baseSalary: moneyField,
  hourlyRate: moneyField,
  hoursPerWeek: numberField(1, 80).default(40),
  pensionEmployeeBp: percentField,
  pensionEmployerBp: percentField,
  notes: optionalText(500),
}).refine((c) => (c.payType === "HOURLY" ? c.hourlyRate > 0 : c.baseSalary > 0), { message: "validation.salaryRequired", path: ["baseSalary"] })
  .refine((c) => !c.endDate || c.endDate >= c.startDate, { message: "validation.endAfterStart", path: ["endDate"] });

/** Salary data (contracts, fixed components) may only be changed by roles that may also see it. */
async function requireSalaryEdit() {
  const ctx = await requirePermission("employees.edit");
  if (!can(ctx.role, "employees.viewSalary")) throw new AuthError("errors.forbidden");
  return ctx;
}

/** The Art. 17a regime may only be linked once a verified rule set for it exists (its legal scope must be confirmed). */
async function ensureRegimeAllowed(companyId: string, regime: string) {
  if (regime === "STANDARD") return;
  const verified = await db.taxRuleSet.findFirst({ where: { regime: "ART17A", verificationStatus: "VERIFIED", approvalStatus: "APPROVED", OR: [{ companyId }, { companyId: null }] } });
  if (!verified) throw new UserError("errors.regimeNotVerified");
}

async function ensureCurrencies(...codes: (string | null | undefined)[]) {
  for (const code of codes) if (code && !(await assertActiveCurrency(code))) throw new UserError("errors.currencyInactive", { code });
}

async function ensureDepartment(companyId: string, departmentId: string | null) {
  if (!departmentId) return null;
  const d = await db.department.findFirst({ where: { id: departmentId, companyId } });
  if (!d) throw new UserError("errors.invalidDepartment");
  return d.id;
}

export async function createEmployeeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const ctx = await requirePermission("employees.edit");
    const raw = formObject(fd);
    const e = employeeSchema.parse(raw);
    const c = contractSchema.parse({ ...raw, startDate: raw.contractStart ?? raw.hireDate });
    await ensureCurrencies(c.salaryCurrency, e.paymentCurrency);
    await ensureRegimeAllowed(ctx.company.id, e.taxRegime);
    const departmentId = await ensureDepartment(ctx.company.id, e.departmentId);
    const created = await db.employee.create({
      data: { ...e, departmentId, companyId: ctx.company.id, contracts: { create: c } },
    });
    id = created.id;
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "employee.create", entity: "Employee", entityId: id, details: { employeeNumber: e.employeeNumber } });
  } catch (err) {
    return handleError(err);
  }
  redirect(`/app/employees/${id}?created=1`);
}

export async function updateEmployeeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("employees.edit");
    const raw = formObject(fd);
    const id = z.string().parse(raw.id);
    const existing = await db.employee.findFirst({ where: { id, companyId: ctx.company.id } });
    if (!existing) throw new UserError("errors.notFound");
    const e = employeeSchema.extend({
      status: z.enum(["ACTIVE", "ON_LEAVE", "TERMINATED"]),
      terminationDate: optionalDate,
    }).parse(raw);
    const t = await getTranslations();
    if (e.status === "TERMINATED" && !e.terminationDate) return { ok: false, message: t("errors.terminationDateRequired"), errors: { terminationDate: [t("validation.required")] } };
    await ensureCurrencies(e.paymentCurrency);
    if (e.taxRegime !== existing.taxRegime) await ensureRegimeAllowed(ctx.company.id, e.taxRegime);
    const departmentId = await ensureDepartment(ctx.company.id, e.departmentId);
    await db.employee.update({ where: { id }, data: { ...e, departmentId } });
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "employee.update", entity: "Employee", entityId: id });
    revalidatePath(`/app/employees/${id}`);
    return ok(t("employees.saved"));
  } catch (err) {
    return handleError(err);
  }
}

export async function addContractAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireSalaryEdit();
    const raw = formObject(fd);
    const employeeId = z.string().parse(raw.employeeId);
    const emp = await db.employee.findFirst({ where: { id: employeeId, companyId: ctx.company.id } });
    if (!emp) throw new UserError("errors.notFound");
    const c = contractSchema.parse(raw);
    await ensureCurrencies(c.salaryCurrency);
    await db.contract.create({ data: { ...c, employeeId } });
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "contract.create", entity: "Employee", entityId: employeeId, details: { baseSalary: c.baseSalary, hourlyRate: c.hourlyRate, currency: c.salaryCurrency, startDate: c.startDate.toISOString() } });
    revalidatePath(`/app/employees/${employeeId}`);
    return ok((await getTranslations())("employee.contractSaved"));
  } catch (err) {
    return handleError(err);
  }
}

const assignmentSchema = z.object({
  id: z.string().optional(),
  employeeId: z.string(),
  component: z.string({ error: "validation.selectComponent" }),
  label: z.string().max(80).optional(),
  frequency: z.enum(["MONTHLY", "PER_PERIOD", "ONE_OFF", "ANNUAL", "ACCRUAL"], { error: "validation.required" }),
  payMonth: z.coerce.number().int().min(1).max(12).optional(),
  startDate: dateField,
  endDate: optionalDate,
  isActive: z.string().optional(),
  note: z.string().max(500).optional(),
});

/**
 * Creates or updates a fixed component of an employee (allowance or deduction that is processed
 * automatically on every payslip within its validity, according to its frequency).
 */
export async function saveAssignmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireSalaryEdit();
    const raw = formObject(fd);
    const t = await getTranslations();
    const d = assignmentSchema.parse(raw);
    const emp = await db.employee.findFirst({ where: { id: d.employeeId, companyId: ctx.company.id } });
    if (!emp) throw new UserError("errors.invalidEmployeeOrComponent");
    const existing = d.id ? await db.employeePayComponent.findFirst({ where: { id: d.id, employeeId: emp.id }, include: { component: true } }) : null;
    if (d.id && !existing) throw new UserError("errors.notFound");
    const comp = existing ? existing.component : await resolveComponent(ctx.company.id, d.component, await getLocale());
    if (d.endDate && d.endDate < d.startDate) return { ok: false, message: t("validation.fixFields"), errors: { endDate: [t("validation.endAfterStart")] }, ts: Date.now() };
    const contract = await db.contract.findFirst({ where: { employeeId: emp.id }, orderBy: { startDate: "desc" } });
    const { errors, values } = await parseOverrides(ctx.company.id, comp, raw, { incidental: false, parseMoney, defaultCurrency: contract?.salaryCurrency ?? ctx.company.currency });
    if (Object.keys(errors).length) return { ok: false, message: t("validation.fixFields"), errors: Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, [t(v as never)]])), ts: Date.now() };
    await ensureCurrencies(values.currency);
    await assertPensionNotDouble(emp.id, comp);
    const label = d.label && d.label !== comp.name ? d.label : null;
    const endDate = d.frequency === "ONE_OFF" ? null : d.endDate;
    // The form posts activeField so an unchecked "active" box can be told apart from a form without it.
    const isActive = raw.activeField ? d.isActive === "on" || d.isActive === "true" : existing?.isActive ?? true;
    if (isActive) await assertNoFixedDuplicate({ id: existing?.id, employeeId: emp.id, componentId: comp.id, label, frequency: d.frequency, startDate: d.startDate, endDate });
    const data = {
      ...values, label, frequency: d.frequency, payMonth: d.frequency === "ANNUAL" || d.frequency === "ACCRUAL" ? d.payMonth ?? null : null,
      startDate: d.startDate, endDate, isActive, note: d.note ?? null,
    };
    if (existing) await db.employeePayComponent.update({ where: { id: existing.id }, data });
    else await db.employeePayComponent.create({ data: { ...data, employeeId: emp.id, componentId: comp.id } });
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: existing ? "employee.component_updated" : "employee.component_assigned", entity: "Employee", entityId: emp.id, details: { component: comp.code, frequency: d.frequency, amount: values.amount, currency: values.currency, rateBp: values.rateBp, taxOverride: values.taxOverride, isActive } });
    const rec = await recalcOpenRuns(ctx.company.id, emp.id, calculateRun);
    revalidatePath(`/app/employees/${emp.id}`);
    const msg = t(existing ? "employee.componentUpdated" : "employee.componentAdded", { name: label ?? comp.name });
    return ok(rec.recalculated || rec.failed ? `${msg} ${t(rec.failed ? "employee.recalcFailed" : "employee.recalculated", { count: rec.recalculated })}` : msg);
  } catch (err) {
    return handleError(err);
  }
}

/** Assigns a component to several employees at once (e.g. a gratuity for a group, or a new standard allowance). */
export async function bulkAssignAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireSalaryEdit();
    const t = await getTranslations();
    const raw = formObject(fd);
    const ids = fd.getAll("employeeIds").map(String).filter(Boolean);
    if (ids.length === 0) return { ok: false, message: t("validation.selectEmployee"), errors: { employeeIds: [t("validation.selectEmployee")] }, ts: Date.now() };
    const d = assignmentSchema.omit({ employeeId: true, id: true }).parse(raw);
    if (d.endDate && d.endDate < d.startDate) throw new UserError("validation.endAfterStart");
    const comp = await resolveComponent(ctx.company.id, d.component, await getLocale());
    const employees = await db.employee.findMany({ where: { id: { in: ids }, companyId: ctx.company.id }, include: { contracts: { orderBy: { startDate: "desc" }, take: 1 } } });
    const skipped: string[] = [];
    let created = 0;
    for (const emp of employees) {
      const { errors, values } = await parseOverrides(ctx.company.id, comp, raw, { incidental: false, parseMoney, defaultCurrency: emp.contracts[0]?.salaryCurrency ?? ctx.company.currency });
      if (Object.keys(errors).length) return { ok: false, message: t("validation.fixFields"), errors: Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, [t(v as never)]])), ts: Date.now() };
      await ensureCurrencies(values.currency);
      const endDate = d.frequency === "ONE_OFF" ? null : d.endDate;
      const label = d.label && d.label !== comp.name ? d.label : null;
      try {
        await assertPensionNotDouble(emp.id, comp);
        await assertNoFixedDuplicate({ employeeId: emp.id, componentId: comp.id, label, frequency: d.frequency, startDate: d.startDate, endDate });
      } catch (e) {
        if (e instanceof UserError) { skipped.push(`${emp.firstName} ${emp.lastName}`); continue; }
        throw e;
      }
      await db.employeePayComponent.create({ data: { ...values, label, employeeId: emp.id, componentId: comp.id, frequency: d.frequency, payMonth: d.frequency === "ANNUAL" || d.frequency === "ACCRUAL" ? d.payMonth ?? null : null, startDate: d.startDate, endDate, note: d.note ?? null } });
      created++;
    }
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "employee.component_bulk_assigned", entity: "PayComponent", entityId: comp.id, details: { component: comp.code, employees: created, skipped } });
    revalidatePath("/app/settings/components");
    return ok(`${t("employee.bulkAssigned", { count: created, name: comp.name })}${skipped.length ? ` ${t("employee.bulkSkipped", { list: skipped.join(", ") })}` : ""}`);
  } catch (err) {
    return handleError(err);
  }
}

export async function removeComponentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireSalaryEdit();
    const id = z.string().parse(fd.get("id"));
    const a = await db.employeePayComponent.findFirst({ where: { id, employee: { companyId: ctx.company.id } } });
    if (!a) throw new UserError("errors.notFound");
    // A component that was part of approved payroll stays as history: end or deactivate it instead of deleting it.
    const finalRuns = await db.payrollRun.findMany({ where: { status: { in: ["APPROVED", "PAID"] }, payslips: { some: { employeeId: a.employeeId } } }, select: { year: true, month: true } });
    const ym = (dt: Date) => dt.getUTCFullYear() * 12 + dt.getUTCMonth();
    if (finalRuns.some((r) => { const p = r.year * 12 + r.month - 1; return p >= ym(a.startDate) && (!a.endDate || p <= ym(a.endDate)); })) throw new UserError("errors.assignmentInUse");
    await db.employeePayComponent.delete({ where: { id } });
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "employee.component_removed", entity: "Employee", entityId: a.employeeId });
    await recalcOpenRuns(ctx.company.id, a.employeeId, calculateRun);
    revalidatePath(`/app/employees/${a.employeeId}`);
    return ok((await getTranslations())("employee.removed"));
  } catch (err) {
    return handleError(err);
  }
}

const ALLOWED_MIME = new Set(["application/pdf", "image/png", "image/jpeg", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
const MAX_UPLOAD = 8 * 1024 * 1024;

export async function uploadDocumentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("employees.edit");
    const employeeId = z.string().parse(fd.get("employeeId"));
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new UserError("errors.chooseFile");
    if (file.size > MAX_UPLOAD) throw new UserError("errors.fileTooLarge");
    if (!ALLOWED_MIME.has(file.type)) throw new UserError("errors.fileType");
    const emp = await db.employee.findFirst({ where: { id: employeeId, companyId: ctx.company.id } });
    if (!emp) throw new UserError("errors.notFound");
    const key = await storage.put(Buffer.from(await file.arrayBuffer()), ctx.company.id);
    const fileName = file.name.replace(/[^\w.\- ()]/g, "_").slice(0, 150);
    await db.employeeDocument.create({ data: { employeeId, fileName, mimeType: file.type, size: file.size, storageKey: key, uploadedBy: ctx.user.id } });
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "document.upload", entity: "Employee", entityId: employeeId, details: { fileName } });
    revalidatePath(`/app/employees/${employeeId}`);
    return ok((await getTranslations())("employee.docUploaded"));
  } catch (err) {
    return handleError(err);
  }
}

export async function deleteDocumentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("employees.edit");
    const id = z.string().parse(fd.get("id"));
    const doc = await db.employeeDocument.findFirst({ where: { id, employee: { companyId: ctx.company.id } } });
    if (!doc) throw new UserError("errors.notFound");
    await db.employeeDocument.delete({ where: { id } });
    await storage.remove(doc.storageKey);
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "document.delete", entity: "Employee", entityId: doc.employeeId, details: { fileName: doc.fileName } });
    revalidatePath(`/app/employees/${doc.employeeId}`);
    return ok((await getTranslations())("employee.docDeleted"));
  } catch (err) {
    return handleError(err);
  }
}

/** Creates (or links) a self-service login for an employee and returns a one-time temporary password. */
export async function enableSelfServiceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("users.manage");
    const id = z.string().parse(fd.get("employeeId"));
    const emp = await db.employee.findFirst({ where: { id, companyId: ctx.company.id } });
    if (!emp) throw new UserError("errors.notFound");
    if (!emp.email) throw new UserError("errors.addEmailFirst");
    if (emp.userId) throw new UserError("errors.selfServiceExists");
    let user = await db.user.findUnique({ where: { email: emp.email } });
    let tempPassword: string | null = null;
    if (!user) {
      tempPassword = randomBytes(9).toString("base64url");
      user = await db.user.create({ data: { email: emp.email, name: `${emp.firstName} ${emp.lastName}`, passwordHash: await bcrypt.hash(tempPassword, 12), locale: ctx.user.locale } });
    }
    const existing = await db.membership.findUnique({ where: { userId_companyId: { userId: user.id, companyId: ctx.company.id } } });
    if (!existing) await db.membership.create({ data: { userId: user.id, companyId: ctx.company.id, role: "EMPLOYEE" } });
    await db.employee.update({ where: { id }, data: { userId: user.id } });
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "employee.self_service_enabled", entity: "Employee", entityId: id });
    revalidatePath(`/app/employees/${id}`);
    const t = await getTranslations();
    return ok(tempPassword
      ? t("employee.selfServiceNew", { email: emp.email, password: tempPassword })
      : t("employee.selfServiceExisting", { email: emp.email }));
  } catch (err) {
    return handleError(err);
  }
}
