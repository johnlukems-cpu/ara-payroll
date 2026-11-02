import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";

export function NoProfile() {
  const t = useTranslations();
  return <Card><EmptyState title={t("me.noProfile")} description={t("me.noProfileText")} /></Card>;
}
