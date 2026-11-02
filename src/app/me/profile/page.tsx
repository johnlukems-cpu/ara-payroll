import { requireSelf } from "@/lib/server/self-service";
import { date } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { PasswordForm } from "@/components/password-form";

export const metadata = { title: "My profile" };

export default async function Profile() {
  const { ctx, employee } = await requireSelf();
  const rows: [string, string | number | null | undefined][] = employee ? [
    ["Employee no.", employee.employeeNumber], ["Name", `${employee.firstName} ${employee.lastName}`], ["Job title", employee.jobTitle], ["Department", employee.department?.name],
    ["Hire date", date(employee.hireDate)], ["Email", employee.email], ["Phone", employee.phone], ["Address", [employee.address, employee.district].filter(Boolean).join(", ")],
    ["Bank", employee.bankName], ["Bank account", employee.bankAccount],
  ] : [["Email", ctx.user.email]];
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="lg:col-span-2"><PageHeader title="My profile" /></div>
      <Card>
        <CardHeader><CardTitle>Personal details</CardTitle><CardDescription>Contact HR or payroll to correct any details.</CardDescription></CardHeader>
        <CardContent><dl className="grid grid-cols-2 gap-3 text-sm">{rows.map(([k, v]) => <div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="font-medium">{v || "—"}</dd></div>)}</dl></CardContent>
      </Card>
      <Card><CardHeader><CardTitle>Change password</CardTitle></CardHeader><CardContent><PasswordForm /></CardContent></Card>
    </div>
  );
}
