import { Download } from "lucide-react";
import { getI18n } from "@/lib/server/i18n";
import { buttonVariants } from "@/components/ui/button";

/** CSV / Excel / PDF download links for a report route (adds the format parameter). */
export async function ExportLinks({ href }: { href: string }) {
  const { t } = await getI18n();
  const sep = href.includes("?") ? "&" : "?";
  return (
    <span className="flex flex-wrap gap-1.5">
      {(["csv", "xlsx", "pdf"] as const).map((fmt) => (
        <a key={fmt} href={`${href}${sep}format=${fmt}`} className={buttonVariants({ variant: "outline", size: "sm" })} data-testid={`export-${fmt}`}><Download /> {t(`common.export.${fmt}`)}</a>
      ))}
    </span>
  );
}
