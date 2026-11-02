import * as React from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-start gap-2">{actions}</div>}
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

/** ARA Payroll brand mark: parrot icon + wordmark, with the ARA Intelligent Solutions byline. */
export function Logo({ light = false, size = "md", showByline = true, className }: { light?: boolean; size?: "md" | "lg"; showByline?: boolean; className?: string }) {
  const t = useTranslations();
  const icon = size === "lg" ? 48 : 36;
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Image src="/brand/ara-payroll-icon.png" alt="" width={icon} height={icon} className="shrink-0 rounded-[22%] shadow-sm" priority />
      <div className="leading-none">
        <p className={cn("font-extrabold tracking-tight", size === "lg" ? "text-2xl" : "text-[17px]", light ? "text-white" : "text-primary")}>
          ARA <span className={cn("font-semibold", light ? "text-white/90" : "text-primary")}>Payroll</span>
        </p>
        {showByline && <p className={cn("mt-1 text-[10px] uppercase tracking-[0.12em]", light ? "text-white/55" : "text-muted-foreground")}>{t("brand.byLine")}</p>}
      </div>
    </div>
  );
}
