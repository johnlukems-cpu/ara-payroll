import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { PasswordForm } from "@/components/password-form";
import { LanguageSwitcher } from "@/components/language-switcher";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("account.title") };
}

export default async function AccountPage() {
  const ctx = await requirePage();
  const { t } = await getI18n();
  return (
    <div className="max-w-xl space-y-6">
      <PageHeader title={t("account.title")} description={`${ctx.user.name} · ${ctx.user.email}`} />
      <Card>
        <CardHeader><CardTitle>{t("account.languageTitle")}</CardTitle><CardDescription>{t("account.languageSub")}</CardDescription></CardHeader>
        <CardContent><LanguageSwitcher /></CardContent>
      </Card>
      <Card><CardHeader><CardTitle>{t("account.password")}</CardTitle></CardHeader><CardContent><PasswordForm /></CardContent></Card>
    </div>
  );
}
