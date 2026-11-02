"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const TABS = [
  ["/app/settings", "company"],
  ["/app/settings/currency", "currency"],
  ["/app/settings/components", "components"],
  ["/app/settings/tax", "tax"],
  ["/app/settings/leave", "leave"],
  ["/app/settings/departments", "departments"],
  ["/app/settings/users", "users"],
] as const;

export function SettingsTabs() {
  const path = usePathname();
  const t = useTranslations();
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b">
      {TABS.map(([href, key]) => (
        <Link key={href} href={href} className={cn("-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm", path === href ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>{t(`settings.tabs.${key}`)}</Link>
      ))}
    </div>
  );
}
