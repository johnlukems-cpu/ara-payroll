"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Section tabs; `exact` items only match their own path (used for the section's index page). */
export function SubTabs({ items }: { items: { href: string; label: string; exact?: boolean }[] }) {
  const path = usePathname();
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b">
      {items.map((i) => {
        const active = i.exact ? path === i.href || path.startsWith(`${i.href}/declarations`) : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} className={cn("-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm", active ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {i.label}
          </Link>
        );
      })}
    </div>
  );
}
