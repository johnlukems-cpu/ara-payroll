import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

const VARIANT = { VERIFIED: "success", PENDING_VERIFICATION: "warning", CONFLICT: "destructive", COMPANY_POLICY: "muted", VALIDATED: "success", PENDING_LEGAL_VALIDATION: "warning" } as const;

export function LegalBadge({ status }: { status: keyof typeof VARIANT }) {
  const t = useTranslations();
  return <Badge variant={VARIANT[status]}>{t(`legal.${status}`)}</Badge>;
}
