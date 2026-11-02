import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ActionForm, FieldError } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Field, Input } from "@/components/ui/form";
import { loginAction } from "@/app/actions/auth";
import { getContext } from "@/lib/server/auth";
import { AuthShell } from "../auth-shell";

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("auth.signInTitle") };
}

export default async function LoginPage() {
  if (await getContext()) redirect("/app");
  const t = await getTranslations();
  return (
    <AuthShell title={t("auth.signInTitle")} subtitle={t("auth.signInSubtitle")} footer={<>{t("auth.newHere")} <Link className="font-medium text-primary hover:underline" href="/register">{t("auth.createAccountLink")}</Link></>}>
      <ActionForm action={loginAction} className="flex flex-col gap-4">
        <Field label={t("auth.email")} htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
          <FieldError name="email" />
        </Field>
        <Field label={t("auth.password")} htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
          <FieldError name="password" />
        </Field>
        <SubmitButton className="mt-2 w-full" pendingText={t("auth.signingIn")}>{t("auth.signIn")}</SubmitButton>
      </ActionForm>
    </AuthShell>
  );
}
