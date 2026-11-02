import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { PageHeader } from "@/components/ui/misc";
import { SubTabs } from "@/components/sub-tabs";

export default async function TaxLayout({ children }: { children: React.ReactNode }) {
  await requirePage("tax.view");
  const { t } = await getI18n();
  return (
    <div>
      <PageHeader title={t("tax.title")} description={t("tax.subtitle")} />
      <SubTabs
        items={[
          { href: "/app/tax", label: t("tax.tabs.declarations"), exact: true },
          { href: "/app/tax/payroll-tax", label: t("tax.tabs.payrollTax") },
          { href: "/app/tax/aov", label: t("tax.tabs.aov") },
          { href: "/app/tax/history", label: t("tax.tabs.history") },
          { href: "/app/tax/rules", label: t("tax.tabs.rules") },
          { href: "/app/tax/aov-rules", label: t("tax.tabs.aovRules") },
          { href: "/app/tax/legal", label: t("tax.tabs.legal") },
        ]}
      />
      {children}
    </div>
  );
}
