"use client";

import { switchCompanyAction } from "@/app/actions/auth";

export function CompanySwitcherLight({ companies, activeId }: { companies: { id: string; name: string }[]; activeId: string }) {
  return (
    <form action={switchCompanyAction}>
      <select name="companyId" defaultValue={activeId} aria-label="Company" onChange={(e) => e.currentTarget.form?.requestSubmit()} className="rounded-md border bg-card px-2 py-1 text-sm">
        {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </form>
  );
}
