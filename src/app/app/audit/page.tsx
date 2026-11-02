import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const ctx = await requirePage("audit.view");
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const take = 50;
  const logs = await db.auditLog.findMany({ where: { companyId: ctx.company.id }, include: { user: true }, orderBy: { createdAt: "desc" }, take: take + 1, skip: (page - 1) * take });
  return (
    <div>
      <PageHeader title="Audit log" description="Every change to employees, payroll, settings and access is recorded." />
      <Card>
        {logs.length === 0 ? <EmptyState title="No activity yet" /> : (
          <Table>
            <THead><TR><TH>When</TH><TH>User</TH><TH>Action</TH><TH>Record</TH><TH>Details</TH></TR></THead>
            <TBody>
              {logs.slice(0, take).map((l) => (
                <TR key={l.id}>
                  <TD className="tabular whitespace-nowrap">{l.createdAt.toLocaleString("en-GB", { timeZone: "America/Paramaribo" })}</TD>
                  <TD>{l.user?.name ?? "System"}</TD>
                  <TD><code className="rounded bg-muted px-1.5 py-0.5 text-xs">{l.action}</code></TD>
                  <TD className="text-muted-foreground">{l.entity}</TD>
                  <TD className="max-w-md truncate text-xs text-muted-foreground">{l.details ? JSON.stringify(l.details) : ""}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <div className="mt-4 flex justify-between text-sm">
        {page > 1 ? <a className="text-primary hover:underline" href={`?page=${page - 1}`}>← Newer</a> : <span />}
        {logs.length > take && <a className="text-primary hover:underline" href={`?page=${page + 1}`}>Older →</a>}
      </div>
    </div>
  );
}
