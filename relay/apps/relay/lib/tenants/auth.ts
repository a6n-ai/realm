import { and, eq, isNull } from "drizzle-orm";
import { apiKeys, tenants } from "@/db/schema";
import { db } from "@/db/client";
import { bearerToken, hashApiKey } from "@/lib/api-keys";

export async function authenticateTenant(req: Request) {
  const token = bearerToken(req.headers.get("authorization"));
  if (!token) return null;
  const hash = hashApiKey(token);
  const [row] = await db
    .select({
      tenantId: apiKeys.tenantId,
      slug: tenants.slug,
      name: tenants.name,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .innerJoin(tenants, eq(tenants.id, apiKeys.tenantId))
    .where(and(eq(apiKeys.keyHash, hash), isNull(apiKeys.revokedAt)))
    .limit(1);
  if (!row) return null;
  return { tenantId: row.tenantId, slug: row.slug, name: row.name };
}
