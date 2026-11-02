import Link from "next/link";
import { BarChart3, CalendarCheck2, FileText, Landmark, ShieldCheck, Users } from "lucide-react";
import { Logo } from "@/components/ui/misc";
import { buttonVariants } from "@/components/ui/button";

const features = [
  { icon: Users, title: "Employee administration", text: "Personnel files, contracts, salary history, bank details and documents in one secure place." },
  { icon: Landmark, title: "Surinamese payroll engine", text: "Loonbelasting, AOV, heffingskorting, forfaitaire aftrek, overtime and special rewards — with versioned, editable tax tables." },
  { icon: FileText, title: "Professional payslips", text: "Clear PDF payslips for every employee, available instantly through employee self-service." },
  { icon: CalendarCheck2, title: "Leave management", text: "Requests, approvals and balances for annual, sick, maternity and other leave types." },
  { icon: BarChart3, title: "Reports & payments", text: "Payroll journals, wage tax and AOV summaries, annual statements and bank payment files." },
  { icon: ShieldCheck, title: "Secure by design", text: "Role-based access, full audit trail, approval workflow and locked payroll periods." },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#12305f_0%,_#0a1a38_55%)] text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Logo light />
        <nav className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-white/80 hover:text-white">Sign in</Link>
          <Link href="/register" className={buttonVariants({ variant: "accent" })}>Start free</Link>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-24 pt-12">
        <div className="max-w-3xl">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs tracking-wide text-white/75">Built for Surinamese legislation and payroll practice</p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Payroll for Suriname, done right — every month.</h1>
          <p className="mt-5 max-w-2xl text-lg text-white/70">ARA Payroll helps small businesses, large companies and accounting firms run accurate payroll, generate payslips and stay compliant — all in the cloud.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register" className={buttonVariants({ variant: "accent", size: "lg" })}>Create your account</Link>
            <Link href="/login" className={buttonVariants({ variant: "outline", size: "lg", className: "border-white/25 bg-transparent text-white hover:bg-white/10" })}>Sign in</Link>
          </div>
        </div>
        <div className="mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur">
              <f.icon className="h-6 w-6 text-[#2fd3b9]" />
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-white/65">{f.text}</p>
            </div>
          ))}
        </div>
      </main>
      <footer className="border-t border-white/10 py-8 text-center text-xs text-white/50">
        ARA Payroll · Developed by ARA Intelligent Solutions · Part of the ARA software ecosystem
      </footer>
    </div>
  );
}
