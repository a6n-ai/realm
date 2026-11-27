import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";

export async function applyMigrations(): Promise<void> {
  const { TEST_MIGRATIONS } = env as typeof env & { TEST_MIGRATIONS: D1Migration[] };
  await applyD1Migrations(env.DB, TEST_MIGRATIONS);
}
