import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, FieldError } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Field, Input } from "@/components/ui/form";
import { loginAction } from "@/app/actions/auth";
import { getContext } from "@/lib/server/auth";
import { AuthShell } from "../auth-shell";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getContext()) redirect("/app");
  return (
    <AuthShell title="Sign in" subtitle="Welcome back to ARA Payroll." footer={<>New to ARA Payroll? <Link className="font-medium text-primary hover:underline" href="/register">Create an account</Link></>}>
      <ActionForm action={loginAction} className="flex flex-col gap-4">
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
          <FieldError name="email" />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
          <FieldError name="password" />
        </Field>
        <SubmitButton className="mt-2 w-full" pendingText="Signing in…">Sign in</SubmitButton>
      </ActionForm>
    </AuthShell>
  );
}
