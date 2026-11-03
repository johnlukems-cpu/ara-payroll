import { timingSafeEqual } from "node:crypto";
import { processSubscriptions } from "@/lib/server/saas";
import { audit } from "@/lib/server/audit";

/**
 * Daily subscription processing (trial reminders, expired trials, arrears) for a scheduler such as Vercel Cron.
 * Disabled unless CRON_SECRET is configured; the caller must send "Authorization: Bearer <CRON_SECRET>".
 * The same processing also runs whenever an administrator opens the portal dashboard.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("Not configured", { status: 503 });
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return new Response("Unauthorized", { status: 401 });
  const result = await processSubscriptions();
  await audit({ companyId: null, userId: null, action: "platform.subscriptions_processed", entity: "Subscription", details: { ...result, source: "cron" } });
  return Response.json(result);
}
