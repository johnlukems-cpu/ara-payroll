import type { Contract, Department, Employee } from "@prisma/client";
import { FieldError } from "@/components/action-form";
import { Field, Input, Select } from "@/components/ui/form";
import { SURINAME_BANKS, SURINAME_DISTRICTS, toDateInput, amount } from "@/lib/format";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-xl border bg-card p-5">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </fieldset>
  );
}

function F({ name, label, children, hint }: { name: string; label: string; children: React.ReactNode; hint?: string }) {
  return (
    <Field label={label} htmlFor={name} hint={hint}>
      {children}
      <FieldError name={name} />
    </Field>
  );
}

export function EmployeeFields({ e, departments, showStatus }: { e?: Employee | null; departments: Department[]; showStatus?: boolean }) {
  return (
    <div className="space-y-5">
      <Section title="Personal details">
        <F name="employeeNumber" label="Employee number"><Input id="employeeNumber" name="employeeNumber" defaultValue={e?.employeeNumber} required /></F>
        <F name="firstName" label="First name(s)"><Input id="firstName" name="firstName" defaultValue={e?.firstName} required /></F>
        <F name="lastName" label="Surname"><Input id="lastName" name="lastName" defaultValue={e?.lastName} required /></F>
        <F name="idNumber" label="ID number" hint="Surinamese ID-kaart number"><Input id="idNumber" name="idNumber" defaultValue={e?.idNumber ?? ""} /></F>
        <F name="dateOfBirth" label="Date of birth"><Input id="dateOfBirth" name="dateOfBirth" type="date" defaultValue={toDateInput(e?.dateOfBirth)} /></F>
        <F name="gender" label="Gender">
          <Select id="gender" name="gender" defaultValue={e?.gender ?? ""}><option value="">—</option><option>Female</option><option>Male</option><option>Other</option></Select>
        </F>
        <F name="maritalStatus" label="Marital status">
          <Select id="maritalStatus" name="maritalStatus" defaultValue={e?.maritalStatus ?? ""}><option value="">—</option><option>Single</option><option>Married</option><option>Living together</option><option>Divorced</option><option>Widowed</option></Select>
        </F>
        <F name="numberOfChildren" label="Number of children" hint="Used for tax-free child allowance"><Input id="numberOfChildren" name="numberOfChildren" type="number" min={0} defaultValue={e?.numberOfChildren ?? 0} /></F>
      </Section>
      <Section title="Contact">
        <F name="email" label="Email"><Input id="email" name="email" type="email" defaultValue={e?.email ?? ""} /></F>
        <F name="phone" label="Phone"><Input id="phone" name="phone" defaultValue={e?.phone ?? ""} placeholder="+597 …" /></F>
        <F name="district" label="District">
          <Select id="district" name="district" defaultValue={e?.district ?? ""}><option value="">—</option>{SURINAME_DISTRICTS.map((d) => <option key={d}>{d}</option>)}</Select>
        </F>
        <F name="address" label="Address"><Input id="address" name="address" defaultValue={e?.address ?? ""} /></F>
      </Section>
      <Section title="Employment & payment">
        <F name="jobTitle" label="Job title"><Input id="jobTitle" name="jobTitle" defaultValue={e?.jobTitle ?? ""} /></F>
        <F name="departmentId" label="Department">
          <Select id="departmentId" name="departmentId" defaultValue={e?.departmentId ?? ""}><option value="">—</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
        </F>
        <F name="hireDate" label="Hire date"><Input id="hireDate" name="hireDate" type="date" defaultValue={toDateInput(e?.hireDate)} required /></F>
        <F name="bankName" label="Bank">
          <Select id="bankName" name="bankName" defaultValue={e?.bankName ?? ""}><option value="">—</option>{SURINAME_BANKS.map((b) => <option key={b}>{b}</option>)}</Select>
        </F>
        <F name="bankAccount" label="Bank account number"><Input id="bankAccount" name="bankAccount" defaultValue={e?.bankAccount ?? ""} /></F>
        {showStatus && (
          <>
            <F name="status" label="Status">
              <Select id="status" name="status" defaultValue={e?.status}><option value="ACTIVE">Active</option><option value="ON_LEAVE">On leave</option><option value="TERMINATED">Terminated</option></Select>
            </F>
            <F name="terminationDate" label="Termination date"><Input id="terminationDate" name="terminationDate" type="date" defaultValue={toDateInput(e?.terminationDate)} /></F>
          </>
        )}
      </Section>
    </div>
  );
}

export function ContractFields({ c, prefixStart = "startDate" }: { c?: Contract | null; prefixStart?: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <F name="contractType" label="Contract type">
        <Select id="contractType" name="contractType" defaultValue={c?.contractType ?? "PERMANENT"}>
          <option value="PERMANENT">Permanent (onbepaalde tijd)</option>
          <option value="FIXED_TERM">Fixed term (bepaalde tijd)</option>
          <option value="TEMPORARY">Temporary</option>
          <option value="PROBATION">Probation</option>
        </Select>
      </F>
      <F name="payType" label="Pay type">
        <Select id="payType" name="payType" defaultValue={c?.payType ?? "MONTHLY"}><option value="MONTHLY">Monthly salary</option><option value="HOURLY">Hourly wage</option></Select>
      </F>
      <F name="hoursPerWeek" label="Hours per week"><Input id="hoursPerWeek" name="hoursPerWeek" type="number" min={1} max={80} defaultValue={c?.hoursPerWeek ?? 40} /></F>
      <F name="baseSalary" label="Monthly salary (SRD)" hint="For monthly-paid employees"><Input id="baseSalary" name="baseSalary" inputMode="decimal" defaultValue={c?.baseSalary ? amount(c.baseSalary) : ""} /></F>
      <F name="hourlyRate" label="Hourly rate (SRD)" hint="For hourly-paid employees"><Input id="hourlyRate" name="hourlyRate" inputMode="decimal" defaultValue={c?.hourlyRate ? amount(c.hourlyRate) : ""} /></F>
      <F name={prefixStart} label="Effective from"><Input id={prefixStart} name={prefixStart} type="date" required /></F>
      <F name="endDate" label="End date (optional)"><Input id="endDate" name="endDate" type="date" /></F>
      <F name="pensionEmployeeBp" label="Pension — employee %"><Input id="pensionEmployeeBp" name="pensionEmployeeBp" inputMode="decimal" defaultValue={c ? c.pensionEmployeeBp / 100 : 0} /></F>
      <F name="pensionEmployerBp" label="Pension — employer %"><Input id="pensionEmployerBp" name="pensionEmployerBp" inputMode="decimal" defaultValue={c ? c.pensionEmployerBp / 100 : 0} /></F>
    </div>
  );
}
