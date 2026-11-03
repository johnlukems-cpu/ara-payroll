import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { Logo } from "@/components/ui/misc";
import { buttonVariants } from "@/components/ui/button";
import { logoutAction } from "@/app/actions/auth";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("saas.access.title") };
}

/** Shown when the customer's subscription does not allow access (suspended, cancelled, trial ended). */
export default async function SubscriptionStatusPage() {
  const ctx = await requireUser();
  if (ctx.access.level !== "BLOCKED") redirect("/app");
  const { t } = await getI18n();
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-lg rounded-2xl border bg-card p-8 shadow-sm" data-testid="subscription-blocked">
        <Logo />
        <h1 className="mt-6 text-xl font-semibold">{t("saas.access.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t(`saas.access.blocked.${ctx.access.reason}` as never)}</p>
        <p className="mt-4 text-sm">{t("saas.access.contact")}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/contact?type=quote" className={buttonVariants()}>{t("saas.access.contactCta")}</Link>
          {ctx.memberships.some((m) => m.role === "EMPLOYEE") && <Link href="/me" className={buttonVariants({ variant: "outline" })}>{t("saas.access.myPayslips")}</Link>}
          <form action={logoutAction}><button className={buttonVariants({ variant: "ghost" })}>{t("common.signOut")}</button></form>
        </div>
      </div>
    </div>
  );
}
