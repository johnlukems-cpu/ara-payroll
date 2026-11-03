import { getI18n } from "@/lib/server/i18n";
import { SubTabs } from "@/components/sub-tabs";

/** Leave section tabs: requests, calendar, balances & reports, parental leave. */
export default async function LeaveLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getI18n();
  return (
    <div>
      <SubTabs items={[
        { href: "/app/leave", label: t("leave.tabs.requests"), exact: true },
        { href: "/app/leave/calendar", label: t("leave.tabs.calendar") },
        { href: "/app/leave/overview", label: t("leave.tabs.overview") },
        { href: "/app/leave/parental", label: t("leave.tabs.parental") },
      ]} />
      {children}
    </div>
  );
}
