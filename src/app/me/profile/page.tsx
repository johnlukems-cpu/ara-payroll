import { db } from "@/lib/db";
import { requireSelf } from "@/lib/server/self-service";
import { getI18n } from "@/lib/server/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { PasswordForm } from "@/components/password-form";
import { LanguageSwitcher } from "@/components/language-switcher";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("me.profileTitle") };
}

export default async function Profile() {
  const { ctx, employee } = await requireSelf();
  const { t, f } = await getI18n();
  const contract = employee ? await db.contract.findFirst({ where: { employeeId: employee.id }, orderBy: { startDate: "desc" } }) : null;
  const rows: [string, string | number | null | undefined][] = employee ? [
    [t("employee.employeeNumber"), employee.employeeNumber], [t("employees.cols.name"), `${employee.firstName} ${employee.lastName}`], [t("employee.jobTitle"), employee.jobTitle], [t("employee.department"), employee.department?.name],
    [t("employee.hireDate"), f.date(employee.hireDate)], [t("employee.email"), employee.email], [t("employee.phone"), employee.phone], [t("employee.address"), [employee.address, employee.district].filter(Boolean).join(", ")],
    [t("employee.bank"), employee.bankName], [t("employee.bankAccount"), employee.bankAccount],
    [t("me.salaryCurrency"), contract?.salaryCurrency], [t("me.paymentCurrency"), employee.paymentCurrency ?? contract?.salaryCurrency],
  ] : [[t("employee.email"), ctx.user.email]];
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="lg:col-span-2"><PageHeader title={t("me.profileTitle")} /></div>
      <Card>
        <CardHeader><CardTitle>{t("me.personal")}</CardTitle><CardDescription>{t("me.personalSub")}</CardDescription></CardHeader>
        <CardContent><dl className="grid grid-cols-2 gap-3 text-sm">{rows.map(([k, v]) => <div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="font-medium">{v || "—"}</dd></div>)}</dl></CardContent>
      </Card>
      <div className="space-y-6">
        <Card><CardHeader><CardTitle>{t("account.languageTitle")}</CardTitle><CardDescription>{t("account.languageSub")}</CardDescription></CardHeader><CardContent><LanguageSwitcher /></CardContent></Card>
        <Card><CardHeader><CardTitle>{t("me.changePassword")}</CardTitle></CardHeader><CardContent><PasswordForm /></CardContent></Card>
      </div>
    </div>
  );
}
