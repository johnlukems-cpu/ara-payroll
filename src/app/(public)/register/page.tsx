import Link from "next/link";
import { ActionForm, FieldError } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Field, Input } from "@/components/ui/form";
import { registerAction } from "@/app/actions/auth";
import { AuthShell } from "../auth-shell";

export const metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <AuthShell title="Create your account" subtitle="Set up your organisation and first company in under a minute." footer={<>Already have an account? <Link className="font-medium text-primary hover:underline" href="/login">Sign in</Link></>}>
      <ActionForm action={registerAction} className="flex flex-col gap-4">
        <Field label="Full name" htmlFor="name"><Input id="name" name="name" autoComplete="name" /><FieldError name="name" /></Field>
        <Field label="Work email" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" /><FieldError name="email" /></Field>
        <Field label="Password" htmlFor="password" hint="At least 10 characters, including a letter and a number."><Input id="password" name="password" type="password" autoComplete="new-password" /><FieldError name="password" /></Field>
        <Field label="Organisation" htmlFor="organizationName" hint="Your business or accounting firm."><Input id="organizationName" name="organizationName" /><FieldError name="organizationName" /></Field>
        <Field label="First company (employer)" htmlFor="companyName"><Input id="companyName" name="companyName" /><FieldError name="companyName" /></Field>
        <SubmitButton className="mt-2 w-full" pendingText="Creating account…">Create account</SubmitButton>
      </ActionForm>
    </AuthShell>
  );
}
