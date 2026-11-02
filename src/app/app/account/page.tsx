import { requirePage } from "@/lib/server/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { PasswordForm } from "@/components/password-form";

export const metadata = { title: "My account" };

export default async function AccountPage() {
  const ctx = await requirePage();
  return (
    <div className="max-w-xl">
      <PageHeader title="My account" description={`${ctx.user.name} · ${ctx.user.email}`} />
      <Card><CardHeader><CardTitle>Password</CardTitle></CardHeader><CardContent><PasswordForm /></CardContent></Card>
    </div>
  );
}
