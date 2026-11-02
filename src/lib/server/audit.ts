import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export async function audit(params: {
  companyId: string | null;
  userId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: Prisma.InputJsonValue;
}) {
  await db.auditLog.create({
    data: {
      companyId: params.companyId,
      userId: params.userId,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId ?? null,
      details: params.details,
    },
  });
}
