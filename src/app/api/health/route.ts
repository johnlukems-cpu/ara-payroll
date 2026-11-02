import { db } from "@/lib/db";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", service: "ara-payroll" });
  } catch {
    return Response.json({ status: "error" }, { status: 503 });
  }
}
