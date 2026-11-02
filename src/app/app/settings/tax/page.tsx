import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { can } from "@/lib/permissions";
import { amount, date, pct, toDateInput } from "@/lib/format";
import type { Bracket } from "@/lib/payroll/engine";
import { ActionForm, FieldError } from "@/components/action-form";
import { ActionButton } from "@/components/confirm-button";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { saveTaxRuleSetAction, verifyTaxRuleSetAction } from "@/app/actions/settings";

export const metadata = { title: "Tax rules" };

function BracketRows({ prefix, rows, brackets, unit }: { prefix: string; rows: number; brackets: Bracket[]; unit: string }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 text-xs font-medium text-muted-foreground"><span>Up to ({unit}) — empty = no limit</span><span>Rate %</span></div>
      {Array.from({ length: rows }, (_, i) => {
        const b = brackets[i];
        return (
          <div key={i} className="grid grid-cols-2 gap-2">
            <Input name={`${prefix}_upto_${i}`} defaultValue={b?.upTo != null ? amount(b.upTo) : ""} aria-label={`Bracket ${i + 1} upper bound`} />
            <Input name={`${prefix}_rate_${i}`} defaultValue={b ? b.rateBp / 100 : ""} aria-label={`Bracket ${i + 1} rate`} />
          </div>
        );
      })}
    </div>
  );
}

export default async function TaxPage({ searchParams }: { searchParams: Promise<{ edit?: string; copy?: string }> }) {
  const ctx = await requirePage("settings.manage");
  const sp = await searchParams;
  const sets = await db.taxRuleSet.findMany({ where: { OR: [{ companyId: ctx.company.id }, { companyId: null }] }, orderBy: { effectiveFrom: "desc" } });
  const base = sets.find((s) => s.id === (sp.edit ?? sp.copy)) ?? sets[0];
  const editing = sp.edit && base?.companyId === ctx.company.id ? base : null;

  return (
    <div className="space-y-6">
      <Alert variant="warning">
        Statutory rates (loonbelasting brackets, heffingskorting, AOV, overtime and special-reward rules) change through Surinamese legislation. ARA Payroll ships with starting values that must be checked against current Belastingdienst Suriname publications. Rule sets are versioned by effective date; approved payroll keeps the version it was calculated with.
      </Alert>
      <Card>
        <CardHeader><CardTitle>Rule set versions</CardTitle><CardDescription>The most recent version effective on the last day of a payroll period is used. Company versions take precedence over platform defaults.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {sets.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{s.name} {s.isVerified ? <Badge variant="success">Verified</Badge> : <Badge variant="warning">Not verified</Badge>} {s.companyId ? <Badge variant="muted">Company</Badge> : <Badge variant="muted">Platform default</Badge>}</p>
                <p className="text-xs text-muted-foreground">Effective {date(s.effectiveFrom)} · AOV {pct(s.aovRateBp)} · tax credit SRD {amount(s.taxCreditMonthly)}/month · top rate {pct((s.brackets as unknown as Bracket[]).at(-1)?.rateBp ?? 0)}</p>
              </div>
              <div className="flex gap-2">
                {s.companyId && <a href={`?edit=${s.id}`} className="text-primary hover:underline">Edit</a>}
                <a href={`?copy=${s.id}`} className="text-primary hover:underline">New version from this</a>
                {s.companyId && !s.isVerified && can(ctx.role, "company.manage") && <ActionButton action={verifyTaxRuleSetAction} fields={{ id: s.id }} size="sm" variant="outline" confirm="Confirm that you have verified every rate against current legislation.">Mark verified</ActionButton>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{editing ? `Edit ${editing.name}` : "New rule set version"}</CardTitle><CardDescription>Monetary amounts in SRD, rates in percent.</CardDescription></CardHeader>
        <CardContent>
          <ActionForm action={saveTaxRuleSetAction} className="space-y-6" key={base?.id ?? "new"}>
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Name" htmlFor="name"><Input id="name" name="name" defaultValue={editing?.name ?? `SR ${new Date().getUTCFullYear()} (company)`} /><FieldError name="name" /></Field>
              <Field label="Effective from" htmlFor="effectiveFrom"><Input id="effectiveFrom" name="effectiveFrom" type="date" defaultValue={toDateInput(editing?.effectiveFrom ?? base?.effectiveFrom)} /><FieldError name="effectiveFrom" /></Field>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div><p className="mb-2 text-sm font-semibold">Wage tax brackets (annual taxable wage)</p><BracketRows prefix="lb" rows={8} brackets={(base?.brackets as unknown as Bracket[]) ?? []} unit="SRD/year" /></div>
              <div><p className="mb-2 text-sm font-semibold">Overtime tax brackets (monthly overtime pay)</p><BracketRows prefix="ot" rows={5} brackets={(base?.overtimeBrackets as unknown as Bracket[]) ?? []} unit="SRD/month" /></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Tax credit / heffingskorting (SRD/month)" htmlFor="taxCreditMonthly"><Input id="taxCreditMonthly" name="taxCreditMonthly" defaultValue={amount(base?.taxCreditMonthly)} /><FieldError name="taxCreditMonthly" /></Field>
              <Field label="Lump-sum deduction (%)" htmlFor="lumpSumRateBp"><Input id="lumpSumRateBp" name="lumpSumRateBp" defaultValue={(base?.lumpSumRateBp ?? 0) / 100} /><FieldError name="lumpSumRateBp" /></Field>
              <Field label="Lump-sum cap (SRD/year)" htmlFor="lumpSumCapAnnual"><Input id="lumpSumCapAnnual" name="lumpSumCapAnnual" defaultValue={amount(base?.lumpSumCapAnnual)} /></Field>
              <Field label="AOV rate (%)" htmlFor="aovRateBp"><Input id="aovRateBp" name="aovRateBp" defaultValue={(base?.aovRateBp ?? 0) / 100} /><FieldError name="aovRateBp" /></Field>
              <Field label="AOV franchise (SRD/month)" htmlFor="aovFranchiseMonthly"><Input id="aovFranchiseMonthly" name="aovFranchiseMonthly" defaultValue={amount(base?.aovFranchiseMonthly)} /></Field>
              <Field label="Tax-free child allowance (SRD/child/month)" htmlFor="childAllowanceExempt"><Input id="childAllowanceExempt" name="childAllowanceExempt" defaultValue={amount(base?.childAllowanceExempt)} /></Field>
              <Field label="Max. children" htmlFor="childAllowanceMaxChildren"><Input id="childAllowanceMaxChildren" name="childAllowanceMaxChildren" defaultValue={base?.childAllowanceMaxChildren ?? 4} /></Field>
              <Field label="Tax-free special reward (SRD/year)" htmlFor="bonusExemptAnnual"><Input id="bonusExemptAnnual" name="bonusExemptAnnual" defaultValue={amount(base?.bonusExemptAnnual)} /></Field>
            </div>
            <Field label="Notes / legal source" htmlFor="notes"><Textarea id="notes" name="notes" defaultValue={editing?.notes ?? ""} placeholder="e.g. Staatsblad reference, Belastingdienst circular" /></Field>
            <div className="flex justify-end"><SubmitButton>{editing ? "Save changes" : "Create version"}</SubmitButton></div>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
