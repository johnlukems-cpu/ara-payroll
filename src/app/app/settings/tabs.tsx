"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  ["/app/settings", "Company"],
  ["/app/settings/components", "Pay components"],
  ["/app/settings/tax", "Tax rules"],
  ["/app/settings/leave", "Leave types"],
  ["/app/settings/departments", "Departments"],
  ["/app/settings/users", "Users & roles"],
];

export function SettingsTabs() {
  const path = usePathname();
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b">
      {TABS.map(([href, label]) => (
        <Link key={href} href={href} className={cn("-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm", path === href ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>{label}</Link>
      ))}
    </div>
  );
}
