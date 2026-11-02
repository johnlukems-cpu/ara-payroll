import Link from "next/link";
import { requireUser } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { Logo } from "@/components/ui/misc";
import { LanguageSwitcher } from "@/components/language-switcher";
import { CompanySwitcherLight } from "./switcher";
import { logoutAction } from "@/app/actions/auth";

export default async function MeLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireUser();
  const { t } = await getI18n();
  const isStaff = ctx.role && ctx.role !== "EMPLOYEE";
  return (
    <div className="min-h-screen">
      <header className="no-print border-b bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/me"><Logo /></Link>
          <nav className="flex flex-wrap items-center gap-4 text-sm">
            <Link href="/me" className="hover:text-primary">{t("nav.overview")}</Link>
            <Link href="/me/payslips" className="hover:text-primary">{t("nav.payslips")}</Link>
            <Link href="/me/leave" className="hover:text-primary">{t("nav.leave")}</Link>
            <Link href="/me/profile" className="hover:text-primary">{t("nav.profile")}</Link>
            {isStaff && <Link href="/app" className="text-primary">{t("nav.adminArea")}</Link>}
            {ctx.memberships.length > 1 && <CompanySwitcherLight companies={ctx.memberships.map((m) => ({ id: m.companyId, name: m.company.name }))} activeId={ctx.company?.id ?? ""} />}
            <LanguageSwitcher />
            <form action={logoutAction}><button className="text-muted-foreground hover:text-foreground">{t("common.signOut")}</button></form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      <footer className="no-print py-6 text-center text-xs text-muted-foreground">{t("brand.product")} · {t("brand.developedBy")}</footer>
    </div>
  );
}
