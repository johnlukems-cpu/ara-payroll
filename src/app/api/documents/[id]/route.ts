import { db } from "@/lib/db";
import { storage } from "@/lib/server/storage";
import { notFound, withPermission } from "@/lib/server/route-auth";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return withPermission("employees.view", async (ctx) => {
    const { id } = await params;
    const doc = await db.employeeDocument.findFirst({ where: { id, employee: { companyId: ctx.company.id } } });
    if (!doc) return notFound();
    const data = await storage.get(doc.storageKey);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Disposition": `attachment; filename="${doc.fileName.replace(/"/g, "")}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  });
}
