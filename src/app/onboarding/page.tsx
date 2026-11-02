import { redirect } from "next/navigation";
import { requireUser } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { Logo } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/language-switcher";
import { logoutAction } from "@/app/actions/auth";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("onboarding.title") };
}

export default async function Onboarding() {
  const ctx = await requireUser();
  if (ctx.company) redirect(ctx.role === "EMPLOYEE" ? "/me" : "/app");
  const { t } = await getI18n();
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="max-w-md">
        <CardHeader><div className="mb-4 flex items-center justify-between"><Logo /><LanguageSwitcher /></div><CardTitle>{t("onboarding.title")}</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>{t("onboarding.text", { email: ctx.user.email })}</p>
          <form action={logoutAction}><button className="font-medium text-primary hover:underline">{t("common.signOut")}</button></form>
        </CardContent>
      </Card>
    </div>
  );
}
