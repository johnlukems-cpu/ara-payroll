import { db } from "@/lib/db";
import { storage } from "@/lib/server/storage";
import { notFound, withPermission } from "@/lib/server/route-auth";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return withPermission("tax.view", async (ctx) => {
    const { id } = await params;
    const d = await db.declaration.findFirst({ where: { id, companyId: ctx.company.id } });
    if (!d?.receiptStorageKey) return notFound();
    const data = await storage.get(d.receiptStorageKey);
    return new Response(new Uint8Array(data), { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${(d.receiptFileName ?? "receipt").replace(/"/g, "")}"`, "Cache-Control": "no-store" } });
  });
}
