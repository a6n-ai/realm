/**
 * Migrations (drizzle-kit DDL + advisory lock) must hit RDS directly, never the
 * transaction pooler. Prefer DIRECT_DATABASE_URL; fall back to DATABASE_URL for
 * environments with no pooler (e.g. a plain direct-to-RDS setup).
 */
export function resolveMigrationUrl(env: NodeJS.ProcessEnv): string {
  const url = env.DIRECT_DATABASE_URL ?? env.DATABASE_URL;
  if (!url) throw new Error("Neither DIRECT_DATABASE_URL nor DATABASE_URL is set");
  return url;
}
