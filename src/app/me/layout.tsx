import Link from "next/link";
import { requireUser } from "@/lib/server/auth";
import { Logo } from "@/components/ui/misc";
import { CompanySwitcherLight } from "./switcher";
import { logoutAction } from "@/app/actions/auth";

export default async function MeLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireUser();
  const isStaff = ctx.role && ctx.role !== "EMPLOYEE";
  return (
    <div className="min-h-screen">
      <header className="no-print border-b bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/me"><Logo /></Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/me" className="hover:text-primary">Overview</Link>
            <Link href="/me/payslips" className="hover:text-primary">Payslips</Link>
            <Link href="/me/leave" className="hover:text-primary">Leave</Link>
            <Link href="/me/profile" className="hover:text-primary">Profile</Link>
            {isStaff && <Link href="/app" className="text-primary">Admin</Link>}
            {ctx.memberships.length > 1 && <CompanySwitcherLight companies={ctx.memberships.map((m) => ({ id: m.companyId, name: m.company.name }))} activeId={ctx.company?.id ?? ""} />}
            <form action={logoutAction}><button className="text-muted-foreground hover:text-foreground">Sign out</button></form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      <footer className="no-print py-6 text-center text-xs text-muted-foreground">ARA Payroll · Developed by ARA Intelligent Solutions</footer>
    </div>
  );
}
