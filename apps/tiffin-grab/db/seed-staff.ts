// Standalone rebuild step (pnpm --filter tiffin-grab db:seed-staff): creates the
// two login-able staff accounts. Extracted from vitest.teardown.ts so the same
// scrypt-hashed credential seed is invokable outside the test harness — seed.sql
// can't carry a password hash. Idempotent: skips any email that already exists.
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { resolveMigrationUrl } from "./resolve-migration-url";

// Next.js loads .env.local; standalone tsx scripts don't (see db/client.ts).
if (!process.env.DIRECT_DATABASE_URL && !process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* file absent — real env is expected to provide DATABASE_URL */
  }
}

const STAFF = [
  { email: "admin@tiffingrab.ca", password: "Admin123!", name: "Admin", role: "admin" as const },
  { email: "sales@tiffingrab.ca", password: "Member123!", name: "Sales", role: "member" as const },
];

async function main() {
  const connectionString = resolveMigrationUrl(process.env);
  const client = postgres(connectionString, { prepare: false, max: 1 });
  const db = drizzle(client, { schema });
  try {
    const { hashPassword } = await import("../lib/auth/password");
    for (const s of STAFF) {
      const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, s.email)).limit(1);
      if (existing) {
        console.log(`[db:seed-staff] ${s.email} already exists, skipping`);
        continue;
      }
      const password = await hashPassword(s.password);
      await db.transaction(async (tx) => {
        const [u] = await tx.insert(schema.users).values({ email: s.email, name: s.name, role: s.role }).returning({ id: schema.users.id });
        await tx.insert(schema.account).values({ accountId: String(u.id), providerId: "credential", userId: u.id, password });
      });
      console.log(`[db:seed-staff] created ${s.email}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[db:seed-staff] failed:", err);
  process.exit(1);
});
