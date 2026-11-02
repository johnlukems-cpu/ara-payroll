import { db } from "@/lib/db";
import { transition } from "@/lib/server/declarations";
import { audit } from "@/lib/server/audit";
import { nextStatus } from "@/lib/declarations/status";
import { notFound, withPermission } from "@/lib/server/route-auth";

/** Downloads a stored declaration file. The first download moves the declaration to DOWNLOADED (never to SUBMITTED). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return withPermission("tax.view", async (ctx) => {
    const { id } = await params;
    const file = await db.declarationFile.findFirst({ where: { id, declaration: { companyId: ctx.company.id } }, include: { declaration: true } });
    if (!file) return notFound();
    await db.declarationFile.update({ where: { id }, data: { downloadCount: { increment: 1 } } });
    const d = file.declaration;
    if (d.status === "READY_FOR_DOWNLOAD" && nextStatus(d.status, "download") === "DOWNLOADED") {
      await transition(d, "download", ctx.user.id, { downloadedAt: new Date() }, file.fileName);
    } else {
      await audit({ companyId: ctx.company.id, userId: ctx.user.id, action: "declaration.file_downloaded", entity: "Declaration", entityId: d.id, details: { file: file.fileName } });
    }
    return new Response(new Uint8Array(file.content), {
      headers: { "Content-Type": file.mimeType, "Content-Disposition": `attachment; filename="${file.fileName}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  });
}
