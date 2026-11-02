"use client";

import { useTranslations } from "next-intl";
import { switchCompanyAction } from "@/app/actions/auth";

export function CompanySwitcher({ companies, activeId }: { companies: { id: string; name: string }[]; activeId: string }) {
  const t = useTranslations();
  return (
    <form action={switchCompanyAction}>
      <label htmlFor="company-switch" className="mb-1 block text-[10px] font-medium uppercase tracking-[0.14em] text-white/45">{t("nav.company")}</label>
      <select
        id="company-switch"
        name="companyId"
        defaultValue={activeId}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent/50 [&>option]:text-black"
      >
        {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </form>
  );
}
