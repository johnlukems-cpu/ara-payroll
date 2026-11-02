import Link from "next/link";
import { Logo } from "@/components/ui/misc";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-10 text-white lg:flex">
        <Link href="/"><Logo light /></Link>
        <div>
          <p className="text-3xl font-semibold leading-snug tracking-tight">Accurate Surinamese payroll,<br />from contract to payslip.</p>
          <p className="mt-4 max-w-md text-white/60">Loonbelasting · AOV · Payslips · Leave · Reports · Self-service</p>
        </div>
        <p className="text-xs text-white/40">ARA Payroll — Developed by ARA Intelligent Solutions</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden"><Logo /></div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <div className="mt-6 text-sm text-muted-foreground">{footer}</div>
        </div>
      </div>
    </div>
  );
}
