"use client";

import { useTranslations } from "next-intl";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations();
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
      <p className="font-semibold">{t("common.errorTitle")}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t("common.errorText")}</p>
      <button onClick={reset} className="mt-4 text-sm font-medium text-primary hover:underline">{t("common.tryAgain")}</button>
    </div>
  );
}
