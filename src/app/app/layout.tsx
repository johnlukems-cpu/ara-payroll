import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut, UserCircle2 } from "lucide-react";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { can } from "@/lib/permissions";
import { Logo } from "@/components/ui/misc";
import { Nav, type NavItem } from "@/components/shell/nav";
import { CompanySwitcher } from "@/components/shell/company-switcher";
import { LanguageSwitcher } from "@/components/language-switcher";
import { logoutAction } from "@/app/actions/auth";
import { endSupportFromAppAction } from "@/app/actions/admin";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePage();
  if (ctx.role === "EMPLOYEE") redirect("/me");
  const { t, f } = await getI18n();
  const r = ctx.role;
  const items: NavItem[] = [
    { href: "/app", label: t("nav.dashboard"), icon: "dashboard" },
    ...(can(r, "employees.view") ? [{ href: "/app/employees", label: t("nav.employees"), icon: "employees" } as NavItem] : []),
    ...(can(r, "payroll.view") ? [{ href: "/app/payroll", label: t("nav.payroll"), icon: "payroll" } as NavItem] : []),
    ...(can(r, "leave.view") ? [{ href: "/app/leave", label: t("nav.leave"), icon: "leave" } as NavItem] : []),
    ...(can(r, "tax.view") ? [{ href: "/app/tax", label: t("nav.tax"), icon: "tax" } as NavItem] : []),
    ...(can(r, "reports.view") ? [{ href: "/app/reports", label: t("nav.reports"), icon: "reports" } as NavItem] : []),
    ...(can(r, "payroll.view") ? [{ href: "/app/exchange-rates", label: t("nav.exchangeRates"), icon: "rates" } as NavItem] : []),
    { href: "/app/companies", label: t("nav.companies"), icon: "companies" },
    ...(can(r, "settings.manage") || can(r, "users.manage") ? [{ href: "/app/settings", label: t("nav.settings"), icon: "settings" } as NavItem] : []),
    ...(can(r, "company.manage") && !ctx.support ? [{ href: "/app/plan", label: t("nav.plan"), icon: "billing" } as NavItem] : []),
    ...(can(r, "audit.view") ? [{ href: "/app/audit", label: t("nav.audit"), icon: "audit" } as NavItem] : []),
    ...(ctx.user.isPlatformAdmin ? [{ href: "/app/admin", label: t("nav.admin"), icon: "admin" } as NavItem] : []),
    ...(ctx.user.isPlatformAdmin || ctx.user.platformRole ? [{ href: "/admin", label: t("nav.saasPortal"), icon: "customers" } as NavItem] : []),
  ];
  const companies = ctx.memberships.map((m) => ({ id: m.companyId, name: m.company.name }));

  return (
    <div className="flex min-h-screen">
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 overflow-y-auto bg-sidebar px-4 py-5 lg:flex">
        <Link href="/app" className="px-2"><Logo light /></Link>
        <div className="px-1"><CompanySwitcher companies={companies} activeId={ctx.company.id} /></div>
        <Nav items={items} />
        <div className="mt-auto space-y-3 border-t border-white/10 px-2 pt-4">
          <LanguageSwitcher variant="dark" />
          <Link href="/app/account" className="flex items-center gap-2.5 text-sm text-sidebar-foreground hover:text-white">
            <UserCircle2 className="h-8 w-8 text-white/40" />
            <span className="min-w-0">
              <span className="block truncate font-medium text-white">{ctx.user.name}</span>
              <span className="block truncate text-xs text-white/50">{t(`roles.${ctx.role}`)}</span>
            </span>
          </Link>
          <form action={logoutAction}>
            <button className="flex items-center gap-2 text-xs text-white/50 hover:text-white"><LogOut className="h-3.5 w-3.5" /> {t("common.signOut")}</button>
          </form>
          <p className="text-[10px] leading-relaxed text-white/30">{t("brand.product")}<br />{t("brand.developedBy")}</p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex items-center justify-between gap-3 border-b bg-card px-4 py-3 lg:hidden">
          <Logo showByline={false} />
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <form action={logoutAction}><button className="text-sm text-muted-foreground">{t("common.signOut")}</button></form>
          </div>
        </header>
        <div className="no-print overflow-x-auto border-b bg-card px-2 py-2 lg:hidden">
          <div className="flex gap-1 text-sm">
            {items.map((i) => <Link key={i.href} href={i.href} className="whitespace-nowrap rounded-md px-3 py-1.5 hover:bg-muted">{i.label}</Link>)}
          </div>
        </div>
        {ctx.support && (
          <div className="no-print flex flex-wrap items-center justify-between gap-2 bg-warning px-4 py-2 text-sm text-white" data-testid="support-banner">
            <span>{t("saas.support.banner", { company: ctx.company.name, time: f.dateTime(ctx.support.expiresAt) })}</span>
            <form action={endSupportFromAppAction}><input type="hidden" name="id" value={ctx.support.id} /><button className="rounded bg-white/20 px-2 py-0.5 text-xs font-medium hover:bg-white/30">{t("saas.support.end")}</button></form>
          </div>
        )}
        {!ctx.support && ctx.access.level === "WARNING" && (
          <div className="no-print bg-warning/15 px-4 py-2 text-sm" data-testid="access-warning">
            {(t as unknown as (k: string, v: Record<string, number>) => string)(`saas.access.warning.${ctx.access.reason}`, { days: ctx.access.daysLeft ?? 0 })}
          </div>
        )}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
