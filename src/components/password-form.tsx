import { getTranslations } from "next-intl/server";
import { ActionForm, FieldError } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Field, Input } from "@/components/ui/form";
import { changePasswordAction } from "@/app/actions/auth";

export async function PasswordForm() {
  const t = await getTranslations();
  return (
    <ActionForm action={changePasswordAction} className="space-y-3" resetOnSuccess>
      <Field label={t("account.current")} htmlFor="current"><Input id="current" name="current" type="password" autoComplete="current-password" /><FieldError name="current" /></Field>
      <Field label={t("account.new")} htmlFor="next" hint={t("auth.passwordHint")}><Input id="next" name="next" type="password" autoComplete="new-password" /><FieldError name="next" /></Field>
      <SubmitButton>{t("account.change")}</SubmitButton>
    </ActionForm>
  );
}
