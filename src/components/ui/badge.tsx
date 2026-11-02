import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", {
  variants: {
    variant: {
      default: "bg-primary/8 text-primary ring-primary/20",
      success: "bg-success/10 text-success ring-success/25",
      warning: "bg-warning/10 text-warning ring-warning/25",
      destructive: "bg-destructive/10 text-destructive ring-destructive/25",
      muted: "bg-muted text-muted-foreground ring-border",
      accent: "bg-accent/10 text-accent ring-accent/25",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

const STATUS: Record<string, VariantProps<typeof badgeVariants>["variant"]> = {
  ACTIVE: "success", ON_LEAVE: "warning", TERMINATED: "muted",
  DRAFT: "muted", CALCULATED: "default", APPROVED: "accent", PAID: "success",
  PENDING: "warning", REJECTED: "destructive", CANCELLED: "muted",
};

export function StatusBadge({ status }: { status: string }) {
  const t = useTranslations();
  return <Badge variant={STATUS[status] ?? "muted"}>{t(`status.${status}` as never)}</Badge>;
}
