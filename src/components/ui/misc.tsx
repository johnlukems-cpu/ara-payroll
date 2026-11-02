import * as React from "react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border bg-card p-5", className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="tabular mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function Alert({ variant = "info", children, className }: { variant?: "info" | "warning" | "error" | "success"; children: React.ReactNode; className?: string }) {
  const styles = {
    info: "border-ring/30 bg-ring/5 text-foreground",
    warning: "border-warning/40 bg-warning/10 text-foreground",
    error: "border-destructive/40 bg-destructive/10 text-destructive",
    success: "border-success/40 bg-success/10 text-foreground",
  }[variant];
  return <div role={variant === "error" ? "alert" : "status"} className={cn("rounded-lg border px-4 py-3 text-sm", styles, className)}>{children}</div>;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Logo({ light = false, className }: { light?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="8" fill={light ? "#ffffff" : "#0b2a5b"} />
        <path d="M9 23 L16 8 L23 23" stroke={light ? "#0b2a5b" : "#ffffff"} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 18 H20" stroke="#0e9f8a" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
      <div className="leading-tight">
        <p className={cn("text-[15px] font-semibold tracking-tight", light ? "text-white" : "text-foreground")}>ARA Payroll</p>
        <p className={cn("text-[10px] uppercase tracking-[0.12em]", light ? "text-white/55" : "text-muted-foreground")}>by ARA Intelligent Solutions</p>
      </div>
    </div>
  );
}
