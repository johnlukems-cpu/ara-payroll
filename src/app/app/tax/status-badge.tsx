import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

const VARIANT: Record<string, "muted" | "default" | "warning" | "accent" | "success" | "destructive"> = {
  IN_PREPARATION: "muted", CALCULATED: "default", UNDER_REVIEW: "warning", APPROVED: "accent", READY_FOR_DOWNLOAD: "accent",
  DOWNLOADED: "default", SUBMITTED: "warning", ACCEPTED: "success", REJECTED: "destructive", PAID: "success",
};

export function DeclarationStatusBadge({ status }: { status: string }) {
  const t = useTranslations();
  return <Badge variant={VARIANT[status] ?? "muted"}>{t(`decl.status.${status}` as never)}</Badge>;
}
