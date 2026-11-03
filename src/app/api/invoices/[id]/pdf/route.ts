import { db } from "@/lib/db";
import { getContext } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { audit } from "@/lib/server/audit";
import { isSaasAdmin, saasSettings } from "@/lib/server/saas";
import { renderInvoicePdf } from "@/lib/server/invoice-pdf";

/**
 * Invoice PDF. Allowed for ARA administrators and for the customer's own owners/administrators
 * (regular memberships only, never a support session). Everyone else gets 404, so invoice ids cannot be probed.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const inv = await db.invoice.findUnique({ where: { id }, include: { organization: true, payments: { orderBy: { paidAt: "asc" } } } });
  if (!inv) return new Response("Not found", { status: 404 });
  const admin = isSaasAdmin(ctx.user);
  const customer = ctx.memberships.some((m) => !m.support && m.company.organizationId === inv.organizationId && (m.role === "OWNER" || m.role === "ADMIN"));
  if (!admin && !customer) return new Response("Not found", { status: 404 });
  const { t, f } = await getI18n();
  const bytes = await renderInvoicePdf(inv, await saasSettings(), t as never, f);
  await audit({ companyId: null, userId: ctx.user.id, action: "invoice.download", entity: "Invoice", entityId: inv.id, details: { number: inv.number, organizationId: inv.organizationId } });
  return new Response(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${inv.number}.pdf"`, "Cache-Control": "no-store" },
  });
}
