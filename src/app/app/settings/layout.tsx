import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { PageHeader } from "@/components/ui/misc";
import { SettingsTabs } from "./tabs";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requirePage();
  const { t } = await getI18n();
  return (
    <div>
      <PageHeader title={t("settings.title")} description={t("settings.subtitle")} />
      <SettingsTabs />
      {children}
    </div>
  );
}
