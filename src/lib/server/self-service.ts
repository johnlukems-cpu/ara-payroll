import "server-only";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "./auth";

/** Resolves the signed-in user's employee record in the active company. */
export async function requireSelf() {
  const ctx = await requireUser();
  if (!ctx.company) redirect("/onboarding");
  const employee = await db.employee.findFirst({ where: { userId: ctx.user.id, companyId: ctx.company.id }, include: { department: true } });
  return { ctx, employee };
}
