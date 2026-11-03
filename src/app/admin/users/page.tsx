import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/server/admin-page";
import { getI18n } from "@/lib/server/i18n";
import { setPlatformRoleAction } from "@/app/actions/admin";
import { OpField, OpForm } from "@/components/admin-op-form";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("saas.nav.users") };
}

/**
 * Users and roles. Platform roles (super / SaaS administrator) are managed here by super administrators;
 * customer roles (customer administrator, payroll administrator, employee) are managed by the customer itself.
 */
export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requireAdminPage();
  const { t, f } = await getI18n();
  const q = (await searchParams).q?.trim();
  const [staff, users] = await Promise.all([
    db.user.findMany({ where: { OR: [{ platformRole: { not: null } }, { isPlatformAdmin: true }] }, orderBy: { name: "asc" } }),
    db.user.findMany({
      where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {},
      orderBy: { createdAt: "desc" }, take: 200,
      include: { memberships: { include: { company: { select: { name: true, organizationId: true } } } } },
    }),
  ]);
  const role = (u: { platformRole: string | null; isPlatformAdmin: boolean }) => (u.platformRole === "SUPER_ADMIN" || u.isPlatformAdmin ? "SUPER_ADMIN" : u.platformRole);

  return (
    <div className="space-y-6">
      <PageHeader title={t("saas.users.title")} description={t("saas.users.subtitle")} />
      <Card>
        <CardHeader><CardTitle>{t("saas.users.platform")}</CardTitle><CardDescription>{t("saas.users.platformHint")}</CardDescription></CardHeader>
        <Table>
          <THead><TR><TH>{t("saas.customers.contactName")}</TH><TH>{t("saas.users.role")}</TH><TH>{t("saas.customers.lastLogin")}</TH></TR></THead>
          <TBody>
            {staff.map((u) => <TR key={u.id} data-testid={`staff-${u.email}`}><TD>{u.name}<span className="block text-xs text-muted-foreground">{u.email}</span></TD><TD><Badge variant="accent">{t(`saas.roles.${role(u)}` as never)}</Badge></TD><TD className="text-xs">{u.lastLoginAt ? f.dateTime(u.lastLoginAt) : "—"}</TD></TR>)}
          </TBody>
        </Table>
        {ctx.isSuper && (
          <div className="p-4">
            <OpForm action={setPlatformRoleAction} title={t("saas.users.setRole")} submit={t("common.save")} hidden={{}} testId="set-role">
              <OpField label={t("saas.customers.contactEmail")}><Input name="email" type="email" required /></OpField>
              <OpField label={t("saas.users.role")}>
                <Select name="role"><option value="SAAS_ADMIN">{t("saas.roles.SAAS_ADMIN")}</option><option value="SUPER_ADMIN">{t("saas.roles.SUPER_ADMIN")}</option><option value="NONE">{t("saas.users.noRole")}</option></Select>
              </OpField>
              <p className="text-xs text-muted-foreground sm:col-span-2">{t("saas.users.setRoleHint")}</p>
            </OpForm>
          </div>
        )}
      </Card>
      <Card>
        <CardHeader><CardTitle>{t("saas.users.customers")}</CardTitle><CardDescription>{t("saas.users.customersHint")}</CardDescription></CardHeader>
        <form className="flex gap-2 px-4 pb-4"><Input name="q" defaultValue={q} placeholder={t("saas.users.search")} className="w-72" aria-label={t("saas.users.search")} /><Button type="submit" variant="secondary">{t("common.show")}</Button></form>
        <Table>
          <THead><TR><TH>{t("saas.customers.contactName")}</TH><TH>{t("saas.customers.roles")}</TH><TH>{t("saas.customers.cols.status")}</TH><TH>{t("saas.customers.lastLogin")}</TH></TR></THead>
          <TBody>
            {users.map((u) => (
              <TR key={u.id}>
                <TD>{u.name}<span className="block text-xs text-muted-foreground">{u.email}</span></TD>
                <TD className="text-xs">
                  {role(u) && <span className="block font-medium">{t(`saas.roles.${role(u)}` as never)}</span>}
                  {u.memberships.map((m) => <span key={m.id} className="block">{t(`saas.customerRole.${m.role}`)} · <Link href={`/admin/customers/${m.company.organizationId}`} className="hover:underline">{m.company.name}</Link></span>)}
                </TD>
                <TD><Badge variant={u.isActive ? "success" : "muted"}>{t(u.isActive ? "saas.users.active" : "saas.users.inactive")}</Badge></TD>
                <TD className="text-xs">{u.lastLoginAt ? f.dateTime(u.lastLoginAt) : "—"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
