import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-center">
      <p className="text-5xl font-semibold text-primary">404</p>
      <p className="font-medium">{t("common.notFoundTitle")}</p>
      <p className="text-muted-foreground">{t("common.notFoundText")}</p>
      <Link href="/app" className="mt-2 text-sm font-medium text-primary hover:underline">{t("common.backToDashboard")}</Link>
    </div>
  );
}
