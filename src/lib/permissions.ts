import type { Role } from "@prisma/client";

/** Fine-grained permissions, mapped to roles below. Keep in one place so every check is auditable. */
export type Permission =
  | "company.manage"
  | "users.manage"
  | "employees.view"
  | "employees.edit"
  | "employees.viewSalary"
  | "payroll.view"
  | "payroll.run"
  | "payroll.approve"
  | "leave.view"
  | "leave.approve"
  | "reports.view"
  | "settings.manage"
  | "audit.view"
  | "tax.view"
  | "tax.manage"
  | "declarations.prepare"
  | "declarations.approve";

const ALL: Permission[] = [
  "company.manage", "users.manage", "employees.view", "employees.edit", "employees.viewSalary",
  "payroll.view", "payroll.run", "payroll.approve", "leave.view", "leave.approve",
  "reports.view", "settings.manage", "audit.view", "tax.view", "tax.manage", "declarations.prepare", "declarations.approve",
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  OWNER: ALL,
  ADMIN: ALL,
  PAYROLL_MANAGER: [
    "employees.view", "employees.edit", "employees.viewSalary", "payroll.view", "payroll.run",
    "payroll.approve", "leave.view", "leave.approve", "reports.view", "settings.manage",
    "tax.view", "tax.manage", "declarations.prepare", "declarations.approve",
  ],
  HR_MANAGER: ["employees.view", "employees.edit", "leave.view", "leave.approve"],
  ACCOUNTANT: ["employees.view", "employees.viewSalary", "payroll.view", "reports.view", "audit.view", "tax.view"],
  EMPLOYEE: [],
};


export function can(role: Role | null | undefined, permission: Permission): boolean {
  return !!role && ROLE_PERMISSIONS[role].includes(permission);
}
