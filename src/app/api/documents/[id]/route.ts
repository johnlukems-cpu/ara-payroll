import { db } from "@/lib/db";
import { storage } from "@/lib/server/storage";
import { notFound, withPermission } from "@/lib/server/route-auth";
import { audit } from "@/lib/server/audit";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withPermission("employees.view", async (ctx) => {
    const { id } = await params;
    const doc = await db.employeeDocument.findFirst({ where: { id, employee: { companyId: ctx.company.id } } });
    if (!doc) return notFound();
    const data = await storage.get(doc.storageKey);
    // Inline viewing only for types browsers render safely (PDF and images); everything else is a download.
    const inline = new URL(req.url).searchParams.get("view") === "1" && ["application/pdf", "image/png", "image/jpeg"].includes(doc.mimeType);
    await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: inline ? "document.view" : "document.download", entity: "Employee", entityId: doc.employeeId, details: { fileName: doc.fileName, documentId: doc.id } });
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${doc.fileName.replace(/"/g, "")}"`,
        ...(doc.mimeType.startsWith("image/") ? { "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox" } : {}),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  });
}
