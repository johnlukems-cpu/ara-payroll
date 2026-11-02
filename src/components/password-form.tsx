import { ActionForm, FieldError } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Field, Input } from "@/components/ui/form";
import { changePasswordAction } from "@/app/actions/auth";

export function PasswordForm() {
  return (
    <ActionForm action={changePasswordAction} className="space-y-3" resetOnSuccess>
      <Field label="Current password" htmlFor="current"><Input id="current" name="current" type="password" autoComplete="current-password" /><FieldError name="current" /></Field>
      <Field label="New password" htmlFor="next" hint="At least 10 characters, including a letter and a number."><Input id="next" name="next" type="password" autoComplete="new-password" /><FieldError name="next" /></Field>
      <SubmitButton>Change password</SubmitButton>
    </ActionForm>
  );
}
