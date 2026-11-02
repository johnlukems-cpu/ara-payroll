import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ARA Payroll", template: "%s · ARA Payroll" },
  description: "Cloud-based payroll management for Suriname. ARA Payroll — developed by ARA Intelligent Solutions.",
  applicationName: "ARA Payroll",
  authors: [{ name: "ARA Intelligent Solutions" }],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
