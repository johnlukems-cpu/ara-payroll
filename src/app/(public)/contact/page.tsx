import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ActionForm, FieldError } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { submitContactAction } from "@/app/actions/contact";
import { isPlanId, PLANS } from "@/lib/pricing";
import { AuthShell } from "../auth-shell";

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("contact.title") };
}

/** Demo and quote requests from the website (stored for the ARA team; see Platform administration). */
export default async function ContactPage({ searchParams }: { searchParams: Promise<{ type?: string; plan?: string }> }) {
  const t = await getTranslations();
  const sp = await searchParams;
  const type = sp.type === "quote" ? "QUOTE" : "DEMO";
  const plan = isPlanId(sp.plan) ? sp.plan : "";
  return (
    <AuthShell
      title={t(type === "QUOTE" ? "contact.quoteTitle" : "contact.demoTitle")}
      subtitle={t(type === "QUOTE" ? "contact.quoteSub" : "contact.demoSub")}
      footer={<Link className="font-medium text-primary hover:underline" href="/#prijzen">{t("contact.backToPricing")}</Link>}
    >
      <ActionForm action={submitContactAction} className="flex flex-col gap-4" resetOnSuccess>
        <input type="hidden" name="type" value={type} />
        {/* Honeypot: hidden from people, filled in by bots. */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
        <Field label={t("contact.plan")} htmlFor="plan">
          <Select id="plan" name="plan" defaultValue={plan}>
            <option value="">{t("contact.noPlan")}</option>
            {PLANS.map((p) => <option key={p.id} value={p.id}>{t(`pricing.plans.${p.id}.name`)}</option>)}
          </Select>
        </Field>
        <Field label={t("contact.name")} htmlFor="name"><Input id="name" name="name" autoComplete="name" /><FieldError name="name" /></Field>
        <Field label={t("contact.company")} htmlFor="company"><Input id="company" name="company" autoComplete="organization" /><FieldError name="company" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("contact.email")} htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" /><FieldError name="email" /></Field>
          <Field label={t("contact.phone")} htmlFor="phone"><Input id="phone" name="phone" type="tel" autoComplete="tel" /><FieldError name="phone" /></Field>
        </div>
        <Field label={t("contact.employees")} htmlFor="employees"><Input id="employees" name="employees" inputMode="numeric" /><FieldError name="employees" /></Field>
        <Field label={t("contact.message")} htmlFor="message"><Textarea id="message" name="message" rows={4} maxLength={2000} placeholder={t(type === "QUOTE" ? "contact.quotePlaceholder" : "contact.demoPlaceholder")} /><FieldError name="message" /></Field>
        <p className="text-xs text-muted-foreground">{t("contact.privacy")}</p>
        <SubmitButton size="lg">{t(type === "QUOTE" ? "contact.submitQuote" : "contact.submitDemo")}</SubmitButton>
      </ActionForm>
    </AuthShell>
  );
}
