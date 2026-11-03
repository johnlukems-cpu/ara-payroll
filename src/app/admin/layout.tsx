import Link from "next/link";
import { LogOut } from "lucide-react";
import { requireAdminPage } from "@/lib/server/admin-page";
import { getI18n } from "@/lib/server/i18n";
import { Logo } from "@/components/ui/misc";
import { Nav, type NavItem } from "@/components/shell/nav";
import { LanguageSwitcher } from "@/components/language-switcher";
import { logoutAction } from "@/app/actions/auth";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: { template: `%s · ${t("saas.portal")}`, default: t("saas.portal") } };
}

/** ARA administration portal: separate from the customer application, for ARA Intelligent Solutions staff only. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAdminPage();
  const { t } = await getI18n();
  const items: NavItem[] = [
    { href: "/admin", label: t("saas.nav.dashboard"), icon: "dashboard" },
    { href: "/admin/customers", label: t("saas.nav.customers"), icon: "customers" },
    { href: "/admin/requests", label: t("saas.nav.requests"), icon: "requests" },
    { href: "/admin/plans", label: t("saas.nav.plans"), icon: "plans" },
    { href: "/admin/billing", label: t("saas.nav.billing"), icon: "billing" },
    { href: "/admin/trials", label: t("saas.nav.trials"), icon: "trials" },
    { href: "/admin/users", label: t("saas.nav.users"), icon: "users" },
    { href: "/admin/support", label: t("saas.nav.support"), icon: "support" },
    { href: "/admin/reports", label: t("saas.nav.reports"), icon: "reports" },
    { href: "/admin/settings", label: t("saas.nav.settings"), icon: "settings" },
    { href: "/admin/audit", label: t("saas.nav.audit"), icon: "audit" },
  ];
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 overflow-y-auto bg-sidebar px-4 py-5 lg:flex">
        <Link href="/admin" className="px-2"><Logo light /></Link>
        <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">{t("saas.portal")}</p>
        <Nav items={items} />
        <div className="mt-auto space-y-3 border-t border-white/10 px-2 pt-4">
          <LanguageSwitcher variant="dark" />
          <p className="text-sm text-white"><span className="block font-medium">{ctx.user.name}</span><span className="text-xs text-white/50">{t(ctx.isSuper ? "saas.roles.SUPER_ADMIN" : "saas.roles.SAAS_ADMIN")}</span></p>
          {ctx.memberships.some((m) => !m.support) && <Link href="/app" className="block text-xs text-white/60 hover:text-white">{t("saas.toCustomerApp")}</Link>}
          <form action={logoutAction}><button className="flex items-center gap-2 text-xs text-white/50 hover:text-white"><LogOut className="h-3.5 w-3.5" /> {t("common.signOut")}</button></form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b bg-card px-4 py-3 lg:hidden">
          <Logo showByline={false} />
          <div className="flex items-center gap-3"><LanguageSwitcher /><form action={logoutAction}><button className="text-sm text-muted-foreground">{t("common.signOut")}</button></form></div>
        </header>
        <div className="overflow-x-auto border-b bg-card px-2 py-2 lg:hidden">
          <div className="flex gap-1 text-sm">{items.map((i) => <Link key={i.href} href={i.href} className="whitespace-nowrap rounded-md px-3 py-1.5 hover:bg-muted">{i.label}</Link>)}</div>
        </div>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
