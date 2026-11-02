import type { Contract, Department, Employee } from "@prisma/client";
import { FieldError } from "@/components/action-form";
import { Field, Input, Select } from "@/components/ui/form";
import { CurrencySelect, type CurrencyOption } from "@/components/currency-select";
import { getI18n } from "@/lib/server/i18n";
import { SURINAME_BANKS, SURINAME_DISTRICTS, toDateInput } from "@/lib/format";

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

const GENDERS = ["Female", "Male", "Other"];
const MARITAL = ["Single", "Married", "Living together", "Divorced", "Widowed"];

export async function EmployeeFields({ e, departments, currencies, showStatus, art17aAvailable = false }: { e?: Partial<Employee> | null; departments: Department[]; currencies: CurrencyOption[]; showStatus?: boolean; art17aAvailable?: boolean }) {
  const { t } = await getI18n();
  return (
    <div className="space-y-5">
      <Section title={t("employee.sections.personal")}>
        <F name="employeeNumber" label={t("employee.employeeNumber")}><Input id="employeeNumber" name="employeeNumber" defaultValue={e?.employeeNumber} required /></F>
        <F name="firstName" label={t("employee.firstName")}><Input id="firstName" name="firstName" defaultValue={e?.firstName} required /></F>
        <F name="lastName" label={t("employee.lastName")}><Input id="lastName" name="lastName" defaultValue={e?.lastName} required /></F>
        <F name="idNumber" label={t("employee.idNumber")} hint={t("employee.idNumberHint")}><Input id="idNumber" name="idNumber" defaultValue={e?.idNumber ?? ""} /></F>
        <F name="dateOfBirth" label={t("employee.dateOfBirth")}><Input id="dateOfBirth" name="dateOfBirth" type="date" defaultValue={toDateInput(e?.dateOfBirth)} /></F>
        <F name="gender" label={t("employee.gender")}>
          <Select id="gender" name="gender" defaultValue={e?.gender ?? ""}><option value="">—</option>{GENDERS.map((g) => <option key={g} value={g}>{t(`enums.gender.${g}` as never)}</option>)}</Select>
        </F>
        <F name="maritalStatus" label={t("employee.maritalStatus")}>
          <Select id="maritalStatus" name="maritalStatus" defaultValue={e?.maritalStatus ?? ""}><option value="">—</option>{MARITAL.map((m) => <option key={m} value={m}>{t(`enums.marital.${m.replace(/\s/g, "")}` as never)}</option>)}</Select>
        </F>
        <F name="numberOfChildren" label={t("employee.children")} hint={t("employee.childrenHint")}><Input id="numberOfChildren" name="numberOfChildren" type="number" min={0} defaultValue={e?.numberOfChildren ?? 0} /></F>
      </Section>
      <Section title={t("employee.sections.contact")}>
        <F name="email" label={t("employee.email")}><Input id="email" name="email" type="email" defaultValue={e?.email ?? ""} /></F>
        <F name="phone" label={t("employee.phone")}><Input id="phone" name="phone" defaultValue={e?.phone ?? ""} placeholder="+597 …" /></F>
        <F name="district" label={t("employee.district")}>
          <Select id="district" name="district" defaultValue={e?.district ?? ""}><option value="">—</option>{SURINAME_DISTRICTS.map((d) => <option key={d}>{d}</option>)}</Select>
        </F>
        <F name="address" label={t("employee.address")}><Input id="address" name="address" defaultValue={e?.address ?? ""} /></F>
      </Section>
      <Section title={t("employee.sections.employment")}>
        <F name="jobTitle" label={t("employee.jobTitle")}><Input id="jobTitle" name="jobTitle" defaultValue={e?.jobTitle ?? ""} /></F>
        <F name="departmentId" label={t("employee.department")}>
          <Select id="departmentId" name="departmentId" defaultValue={e?.departmentId ?? ""}><option value="">—</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
        </F>
        <F name="hireDate" label={t("employee.hireDate")}><Input id="hireDate" name="hireDate" type="date" defaultValue={toDateInput(e?.hireDate)} required /></F>
        <F name="bankName" label={t("employee.bank")}>
          <Select id="bankName" name="bankName" defaultValue={e?.bankName ?? ""}><option value="">—</option>{SURINAME_BANKS.map((b) => <option key={b}>{b}</option>)}</Select>
        </F>
        <F name="bankAccount" label={t("employee.bankAccount")}><Input id="bankAccount" name="bankAccount" defaultValue={e?.bankAccount ?? ""} /></F>
        <F name="paymentCurrency" label={t("employee.paymentCurrency")} hint={t("employee.paymentCurrencyHint")}>
          <CurrencySelect id="paymentCurrency" name="paymentCurrency" currencies={currencies} defaultValue={e?.paymentCurrency ?? ""} emptyLabel={t("employee.sameAsSalary")} />
        </F>
        <F name="taxRegime" label={t("employee.taxRegime")} hint={art17aAvailable ? t("employee.taxRegimeHint") : t("employee.taxRegimeLocked")}>
          <Select id="taxRegime" name="taxRegime" defaultValue={e?.taxRegime ?? "STANDARD"}>
            <option value="STANDARD">{t("rules.regime.STANDARD")}</option>
            <option value="ART17A" disabled={!art17aAvailable && e?.taxRegime !== "ART17A"}>{t("rules.regime.ART17A")}</option>
          </Select>
        </F>
        {showStatus && (
          <>
            <F name="status" label={t("employee.status")}>
              <Select id="status" name="status" defaultValue={e?.status}>{["ACTIVE", "ON_LEAVE", "TERMINATED"].map((s) => <option key={s} value={s}>{t(`status.${s}` as never)}</option>)}</Select>
            </F>
            <F name="terminationDate" label={t("employee.terminationDate")}><Input id="terminationDate" name="terminationDate" type="date" defaultValue={toDateInput(e?.terminationDate)} /></F>
          </>
        )}
      </Section>
    </div>
  );
}

export async function ContractFields({ c, currencies, defaultCurrency, prefixStart = "startDate" }: { c?: Contract | null; currencies: CurrencyOption[]; defaultCurrency: string; prefixStart?: string }) {
  const { t, f } = await getI18n();
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <F name="contractType" label={t("employee.contract.contractType")}>
        <Select id="contractType" name="contractType" defaultValue={c?.contractType ?? "PERMANENT"}>
          {["PERMANENT", "FIXED_TERM", "TEMPORARY", "PROBATION"].map((v) => <option key={v} value={v}>{t(`enums.contractType.${v}` as never)}</option>)}
        </Select>
      </F>
      <F name="payType" label={t("employee.contract.payType")}>
        <Select id="payType" name="payType" defaultValue={c?.payType ?? "MONTHLY"}>{["MONTHLY", "WEEKLY", "DAILY", "HOURLY"].map((v) => <option key={v} value={v}>{t(`enums.payType.${v}` as never)}</option>)}</Select>
      </F>
      <F name="salaryCurrency" label={t("employee.contract.salaryCurrency")}>
        <CurrencySelect id="salaryCurrency" name="salaryCurrency" currencies={currencies} defaultValue={c?.salaryCurrency ?? defaultCurrency} />
      </F>
      <F name="baseSalary" label={t("employee.contract.baseSalary")} hint={t("employee.contract.baseSalaryHint")}><Input id="baseSalary" name="baseSalary" inputMode="decimal" defaultValue={f.input(c?.baseSalary)} /></F>
      <F name="hourlyRate" label={t("employee.contract.hourlyRate")} hint={t("employee.contract.hourlyRateHint")}><Input id="hourlyRate" name="hourlyRate" inputMode="decimal" defaultValue={f.input(c?.hourlyRate)} /></F>
      <F name="hoursPerWeek" label={t("employee.contract.hoursPerWeek")}><Input id="hoursPerWeek" name="hoursPerWeek" type="number" min={1} max={80} defaultValue={c?.hoursPerWeek ?? 40} /></F>
      <F name={prefixStart} label={t("employee.contract.effectiveFrom")}><Input id={prefixStart} name={prefixStart} type="date" required /></F>
      <F name="endDate" label={t("employee.contract.endDate")}><Input id="endDate" name="endDate" type="date" /></F>
      <div />
      <F name="pensionEmployeeBp" label={t("employee.contract.pensionEmployee")}><Input id="pensionEmployeeBp" name="pensionEmployeeBp" inputMode="decimal" defaultValue={c ? f.number(c.pensionEmployeeBp / 100) : 0} /></F>
      <F name="pensionEmployerBp" label={t("employee.contract.pensionEmployer")}><Input id="pensionEmployerBp" name="pensionEmployerBp" inputMode="decimal" defaultValue={c ? f.number(c.pensionEmployerBp / 100) : 0} /></F>
    </div>
  );
}
