"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { storage } from "@/lib/server/storage";
import { formObject, handleError, ok, UserError, type ActionState } from "@/lib/server/action";
import { dateField, moneyField, numberField, optionalDate, optionalText, percentField } from "@/lib/validation";

const employeeSchema = z.object({
  employeeNumber: z.string().min(1, "Required").max(30),
  firstName: z.string().min(1, "Required").max(80),
  lastName: z.string().min(1, "Required").max(80),
  idNumber: optionalText(40),
  dateOfBirth: optionalDate,
  gender: optionalText(20),
  maritalStatus: optionalText(30),
  numberOfChildren: numberField(0, 30).default(0),
  email: z.email("Invalid email").optional().transform((v) => v?.toLowerCase() ?? null),
  phone: optionalText(40),
  address: optionalText(200),
  district: optionalText(40),
  bankName: optionalText(80),
  bankAccount: optionalText(40),
  departmentId: optionalText(40),
  jobTitle: optionalText(100),
  hireDate: dateField,
});

const contractSchema = z.object({
  contractType: z.enum(["PERMANENT", "FIXED_TERM", "TEMPORARY", "PROBATION"]),
  payType: z.enum(["MONTHLY", "HOURLY"]),
  startDate: dateField,
  endDate: optionalDate,
  baseSalary: moneyField,
  hourlyRate: moneyField,
  hoursPerWeek: numberField(1, 80).default(40),
  pensionEmployeeBp: percentField,
  pensionEmployerBp: percentField,
  notes: optionalText(500),
}).refine((c) => (c.payType === "MONTHLY" ? c.baseSalary > 0 : c.hourlyRate > 0), { message: "Enter the salary or hourly rate", path: ["baseSalary"] })
  .refine((c) => !c.endDate || c.endDate >= c.startDate, { message: "End date must be after start date", path: ["endDate"] });

async function ensureDepartment(companyId: string, departmentId: string | null) {
  if (!departmentId) return null;
  const d = await db.department.findFirst({ where: { id: departmentId, companyId } });
  if (!d) throw new UserError("Invalid department");
  return d.id;
}

export async function createEmployeeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const ctx = await requirePermission("employees.edit");
    const raw = formObject(fd);
    const e = employeeSchema.parse(raw);
    const c = contractSchema.parse({ ...raw, startDate: raw.contractStart ?? raw.hireDate });
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
    if (!existing) throw new UserError("Employee not found");
    const e = employeeSchema.extend({
      status: z.enum(["ACTIVE", "ON_LEAVE", "TERMINATED"]),
      terminationDate: optionalDate,
    }).parse(raw);
    if (e.status === "TERMINATED" && !e.terminationDate) return { ok: false, message: "Enter a termination date for terminated employees.", errors: { terminationDate: ["Required"] } };
    const departmentId = await ensureDepartment(ctx.company.id, e.departmentId);
    await db.employee.update({ where: { id }, data: { ...e, departmentId } });
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "employee.update", entity: "Employee", entityId: id });
    revalidatePath(`/app/employees/${id}`);
    return ok("Employee details saved.");
  } catch (err) {
    return handleError(err);
  }
}

export async function addContractAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("employees.edit");
    const raw = formObject(fd);
    const employeeId = z.string().parse(raw.employeeId);
    const emp = await db.employee.findFirst({ where: { id: employeeId, companyId: ctx.company.id } });
    if (!emp) throw new UserError("Employee not found");
    const c = contractSchema.parse(raw);
    await db.contract.create({ data: { ...c, employeeId } });
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "contract.create", entity: "Employee", entityId: employeeId, details: { baseSalary: c.baseSalary, hourlyRate: c.hourlyRate, startDate: c.startDate.toISOString() } });
    revalidatePath(`/app/employees/${employeeId}`);
    return ok("New contract / salary change recorded.");
  } catch (err) {
    return handleError(err);
  }
}

export async function assignComponentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("employees.edit");
    const raw = formObject(fd);
    const data = z.object({
      employeeId: z.string(),
      componentId: z.string({ error: "Select a component" }),
      amount: moneyField,
      rate: percentField,
      startDate: dateField,
      endDate: optionalDate,
    }).parse(raw);
    const [emp, comp] = await Promise.all([
      db.employee.findFirst({ where: { id: data.employeeId, companyId: ctx.company.id } }),
      db.payComponent.findFirst({ where: { id: data.componentId, companyId: ctx.company.id } }),
    ]);
    if (!emp || !comp) throw new UserError("Invalid employee or component");
    if (comp.calcType === "FIXED" && data.amount <= 0) return { ok: false, message: "Enter an amount.", errors: { amount: ["Required"] } };
    if (comp.calcType === "PERCENT_OF_BASE" && data.rate <= 0) return { ok: false, message: "Enter a percentage.", errors: { rate: ["Required"] } };
    await db.employeePayComponent.create({
      data: { employeeId: emp.id, componentId: comp.id, amount: data.amount, rateBp: data.rate, startDate: data.startDate, endDate: data.endDate },
    });
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "employee.component_assigned", entity: "Employee", entityId: emp.id, details: { component: comp.code } });
    revalidatePath(`/app/employees/${emp.id}`);
    return ok(`${comp.name} added.`);
  } catch (err) {
    return handleError(err);
  }
}

export async function removeComponentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("employees.edit");
    const id = z.string().parse(fd.get("id"));
    const a = await db.employeePayComponent.findFirst({ where: { id, employee: { companyId: ctx.company.id } } });
    if (!a) throw new UserError("Not found");
    await db.employeePayComponent.delete({ where: { id } });
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "employee.component_removed", entity: "Employee", entityId: a.employeeId });
    revalidatePath(`/app/employees/${a.employeeId}`);
    return ok("Removed.");
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
    if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a file to upload." };
    if (file.size > MAX_UPLOAD) return { ok: false, message: "Files may be at most 8 MB." };
    if (!ALLOWED_MIME.has(file.type)) return { ok: false, message: "Only PDF, PNG, JPEG and DOCX files are allowed." };
    const emp = await db.employee.findFirst({ where: { id: employeeId, companyId: ctx.company.id } });
    if (!emp) throw new UserError("Employee not found");
    const key = await storage.put(Buffer.from(await file.arrayBuffer()), ctx.company.id);
    const fileName = file.name.replace(/[^\w.\- ()]/g, "_").slice(0, 150);
    await db.employeeDocument.create({ data: { employeeId, fileName, mimeType: file.type, size: file.size, storageKey: key, uploadedBy: ctx.user.id } });
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "document.upload", entity: "Employee", entityId: employeeId, details: { fileName } });
    revalidatePath(`/app/employees/${employeeId}`);
    return ok("Document uploaded.");
  } catch (err) {
    return handleError(err);
  }
}

export async function deleteDocumentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requirePermission("employees.edit");
    const id = z.string().parse(fd.get("id"));
    const doc = await db.employeeDocument.findFirst({ where: { id, employee: { companyId: ctx.company.id } } });
    if (!doc) throw new UserError("Not found");
    await db.employeeDocument.delete({ where: { id } });
    await storage.remove(doc.storageKey);
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "document.delete", entity: "Employee", entityId: doc.employeeId, details: { fileName: doc.fileName } });
    revalidatePath(`/app/employees/${doc.employeeId}`);
    return ok("Document deleted.");
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
    if (!emp) throw new UserError("Employee not found");
    if (!emp.email) throw new UserError("Add an email address to the employee first.");
    if (emp.userId) throw new UserError("Self-service is already enabled for this employee.");
    let user = await db.user.findUnique({ where: { email: emp.email } });
    let tempPassword: string | null = null;
    if (!user) {
      tempPassword = randomBytes(9).toString("base64url");
      user = await db.user.create({ data: { email: emp.email, name: `${emp.firstName} ${emp.lastName}`, passwordHash: await bcrypt.hash(tempPassword, 12) } });
    }
    const existing = await db.membership.findUnique({ where: { userId_companyId: { userId: user.id, companyId: ctx.company.id } } });
    if (!existing) await db.membership.create({ data: { userId: user.id, companyId: ctx.company.id, role: "EMPLOYEE" } });
    await db.employee.update({ where: { id }, data: { userId: user.id } });
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "employee.self_service_enabled", entity: "Employee", entityId: id });
    revalidatePath(`/app/employees/${id}`);
    return ok(tempPassword
      ? `Self-service enabled. Share these credentials securely: ${emp.email} / temporary password ${tempPassword} (shown only once — ask the employee to change it after first sign-in).`
      : `Self-service enabled. ${emp.email} already has an ARA account and can sign in with their existing password.`);
  } catch (err) {
    return handleError(err);
  }
}
