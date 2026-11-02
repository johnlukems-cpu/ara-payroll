/** Grants (or with --revoke, removes) platform administrator rights. Usage: npm run admin:grant -- user@example.com */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const email = process.argv.find((a) => a.includes("@"))?.toLowerCase();
  if (!email) throw new Error("Usage: npm run admin:grant -- user@example.com [--revoke]");
  const revoke = process.argv.includes("--revoke");
  const user = await db.user.update({ where: { email }, data: { isPlatformAdmin: !revoke } });
  console.log(`${user.email}: platform administrator = ${user.isPlatformAdmin}`);
}

main().finally(() => db.$disconnect());
