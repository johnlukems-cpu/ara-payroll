import { requirePage } from "@/lib/server/auth";
import { PageHeader } from "@/components/ui/misc";
import { SettingsTabs } from "./tabs";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requirePage();
  return (
    <div>
      <PageHeader title="Settings" description="Company configuration, payroll rules and user access." />
      <SettingsTabs />
      {children}
    </div>
  );
}
