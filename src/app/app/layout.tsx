import Link from "next/link";
import { LogOut, UserCircle2 } from "lucide-react";
import { requirePage } from "@/lib/server/auth";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { Logo } from "@/components/ui/misc";
import { Nav, type NavItem } from "@/components/shell/nav";
import { CompanySwitcher } from "@/components/shell/company-switcher";
import { logoutAction } from "@/app/actions/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePage();
  if (ctx.role === "EMPLOYEE") {
    const { redirect } = await import("next/navigation");
    redirect("/me");
  }
  const r = ctx.role;
  const items: NavItem[] = [
    { href: "/app", label: "Dashboard", icon: "dashboard" },
    ...(can(r, "employees.view") ? [{ href: "/app/employees", label: "Employees", icon: "employees" } as NavItem] : []),
    ...(can(r, "payroll.view") ? [{ href: "/app/payroll", label: "Payroll", icon: "payroll" } as NavItem] : []),
    ...(can(r, "leave.view") ? [{ href: "/app/leave", label: "Leave", icon: "leave" } as NavItem] : []),
    ...(can(r, "reports.view") ? [{ href: "/app/reports", label: "Reports", icon: "reports" } as NavItem] : []),
    { href: "/app/companies", label: "Companies", icon: "companies" },
    ...(can(r, "settings.manage") || can(r, "users.manage") ? [{ href: "/app/settings", label: "Settings", icon: "settings" } as NavItem] : []),
    ...(can(r, "audit.view") ? [{ href: "/app/audit", label: "Audit log", icon: "audit" } as NavItem] : []),
  ];
  const companies = ctx.memberships.map((m) => ({ id: m.companyId, name: m.company.name }));

  return (
    <div className="flex min-h-screen">
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 bg-sidebar px-4 py-5 lg:flex">
        <Link href="/app" className="px-2"><Logo light /></Link>
        <div className="px-1"><CompanySwitcher companies={companies} activeId={ctx.company.id} /></div>
        <Nav items={items} />
        <div className="mt-auto space-y-3 border-t border-white/10 px-2 pt-4">
          <Link href="/app/account" className="flex items-center gap-2.5 text-sm text-sidebar-foreground hover:text-white">
            <UserCircle2 className="h-8 w-8 text-white/40" />
            <span className="min-w-0">
              <span className="block truncate font-medium text-white">{ctx.user.name}</span>
              <span className="block truncate text-xs text-white/50">{ROLE_LABELS[ctx.role]}</span>
            </span>
          </Link>
          <form action={logoutAction}>
            <button className="flex items-center gap-2 text-xs text-white/50 hover:text-white"><LogOut className="h-3.5 w-3.5" /> Sign out</button>
          </form>
          <p className="text-[10px] leading-relaxed text-white/30">ARA Payroll<br />Developed by ARA Intelligent Solutions</p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex items-center justify-between gap-3 border-b bg-card px-4 py-3 lg:hidden">
          <Logo />
          <form action={logoutAction}><button className="text-sm text-muted-foreground">Sign out</button></form>
        </header>
        <div className="no-print overflow-x-auto border-b bg-card px-2 py-2 lg:hidden">
          <div className="flex gap-1 text-sm">
            {items.map((i) => <Link key={i.href} href={i.href} className="whitespace-nowrap rounded-md px-3 py-1.5 hover:bg-muted">{i.label}</Link>)}
          </div>
        </div>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
