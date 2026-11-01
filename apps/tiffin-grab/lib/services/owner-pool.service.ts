import { db } from "@/db/client";
import { sharedCache } from "@/lib/cache";
import { ownerPool, leadSources, users } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import type { OwnerEntity, PoolMember } from "./assignment";

// Per-entity staff pool (inquiries also per-source), read on every new record's owner resolution and
// written only by admins via setMembership. Cache per pool key; setMembership
// evicts the pool it replaces. 60s TTL bounds cross-instance staleness.
const poolCache = sharedCache("owner-pool");
const poolKey = (entity: OwnerEntity, sourceId: bigint | null) => `${entity}:${sourceId == null ? "default" : String(sourceId)}`;

export async function poolFor(entity: OwnerEntity, sourceId: bigint | null = null): Promise<PoolMember[]> {
  return poolCache.getOrSet(poolKey(entity, sourceId), async () =>
    db
      .select({ id: users.id, publicId: users.publicId, weight: ownerPool.weight })
      .from(ownerPool)
      .innerJoin(users, eq(ownerPool.userId, users.id))
      .where(and(eq(ownerPool.entity, entity), sourceId == null ? isNull(ownerPool.sourceId) : eq(ownerPool.sourceId, sourceId))),
  );
}

// Tests seed pools via raw db.insert (bypassing setMembership), so they must
// reset the cache the same way they reset the table.
export function resetPoolCache(): Promise<void> {
  return poolCache.evictAll();
}

export async function listConfig(entity: OwnerEntity): Promise<
  { userPublicId: string; userName: string | null; sourceId: bigint | null; sourceKey: string | null; weight: number }[]
> {
  return db
    .select({
      userPublicId: users.publicId,
      userName: users.name,
      sourceId: ownerPool.sourceId,
      sourceKey: leadSources.key,
      weight: ownerPool.weight,
    })
    .from(ownerPool)
    .innerJoin(users, eq(ownerPool.userId, users.id))
    .leftJoin(leadSources, eq(ownerPool.sourceId, leadSources.id))
    .where(eq(ownerPool.entity, entity));
}

export async function setMembership(
  entity: OwnerEntity,
  sourceId: bigint | null,
  members: { userId: bigint; weight: number }[],
): Promise<void> {
  // Replace-all: delete the entire (source|default) pool, then insert the desired
  // set. Small N, admin-triggered — avoids upsert plumbing.
  const where = and(eq(ownerPool.entity, entity), sourceId == null ? isNull(ownerPool.sourceId) : eq(ownerPool.sourceId, sourceId));
  await db.delete(ownerPool).where(where);
  if (members.length) {
    await db
      .insert(ownerPool)
      .values(members.map((m) => ({ entity, userId: m.userId, sourceId, weight: m.weight })));
  }
  await poolCache.evict(poolKey(entity, sourceId));
}
