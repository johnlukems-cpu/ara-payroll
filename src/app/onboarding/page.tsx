import { redirect } from "next/navigation";
import { requireUser } from "@/lib/server/auth";
import { Logo } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { logoutAction } from "@/app/actions/auth";

export const metadata = { title: "No company access" };

export default async function Onboarding() {
  const ctx = await requireUser();
  if (ctx.company) redirect(ctx.role === "EMPLOYEE" ? "/me" : "/app");
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="max-w-md">
        <CardHeader><Logo className="mb-4" /><CardTitle>No company access</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>Your account ({ctx.user.email}) is not linked to any company. Ask your employer or payroll administrator to grant you access.</p>
          <form action={logoutAction}><button className="font-medium text-primary hover:underline">Sign out</button></form>
        </CardContent>
      </Card>
    </div>
  );
}
