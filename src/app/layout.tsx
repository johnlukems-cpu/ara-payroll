import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Toaster } from "@/components/toaster";
import "@fontsource-variable/inter";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: { default: `${t("brand.product")} — ${t("brand.tagline")}`, template: `%s · ${t("brand.product")}` },
    description: t("brand.metaDescription"),
    applicationName: t("brand.product"),
    authors: [{ name: t("brand.company") }],
    creator: t("brand.company"),
    publisher: t("brand.company"),
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale === "nl" ? "nl-SR" : "en-GB"}>
      <body className="min-h-screen font-sans antialiased">
        <NextIntlClientProvider>
          <Toaster>{children}</Toaster>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
