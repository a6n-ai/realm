import { LruTier, TieredCache } from "@tiffin/commons";
import { db } from "@/db/client";
import { inquiryUserConfig, leadSources, users } from "@/db/schema";
import { eq, isNull } from "drizzle-orm";
import type { PoolMember } from "./assignment";

// Per-source staff pool, read on every inbound inquiry's owner resolution and
// written only by admins via setMembership. Cache per pool key; setMembership
// evicts the pool it replaces. 60s TTL bounds cross-instance staleness.
const poolCache = new TieredCache({ name: "lead-pool", tiers: [new LruTier()], defaultTtlMs: 60_000 });
const poolKey = (sourceId: bigint | null) => (sourceId == null ? "default" : String(sourceId));

export async function poolForSource(sourceId: bigint | null): Promise<PoolMember[]> {
  return poolCache.getOrSet(poolKey(sourceId), async () =>
    db
      .select({ id: users.id, publicId: users.publicId, weight: inquiryUserConfig.weight })
      .from(inquiryUserConfig)
      .innerJoin(users, eq(inquiryUserConfig.userId, users.id))
      .where(sourceId == null ? isNull(inquiryUserConfig.sourceId) : eq(inquiryUserConfig.sourceId, sourceId)),
  );
}

// Tests seed pools via raw db.insert (bypassing setMembership), so they must
// reset the cache the same way they reset the table.
export function resetPoolCache(): Promise<void> {
  return poolCache.evictAll();
}

export async function listConfig(): Promise<
  { userPublicId: string; userName: string | null; sourceId: bigint | null; sourceKey: string | null; weight: number }[]
> {
  return db
    .select({
      userPublicId: users.publicId,
      userName: users.name,
      sourceId: inquiryUserConfig.sourceId,
      sourceKey: leadSources.key,
      weight: inquiryUserConfig.weight,
    })
    .from(inquiryUserConfig)
    .innerJoin(users, eq(inquiryUserConfig.userId, users.id))
    .leftJoin(leadSources, eq(inquiryUserConfig.sourceId, leadSources.id));
}

export async function setMembership(
  sourceId: bigint | null,
  members: { userId: bigint; weight: number }[],
): Promise<void> {
  // Replace-all: delete the entire (source|default) pool, then insert the desired
  // set. Small N, admin-triggered — avoids upsert plumbing.
  const where = sourceId == null ? isNull(inquiryUserConfig.sourceId) : eq(inquiryUserConfig.sourceId, sourceId);
  await db.delete(inquiryUserConfig).where(where);
  if (members.length) {
    await db
      .insert(inquiryUserConfig)
      .values(members.map((m) => ({ userId: m.userId, sourceId, weight: m.weight })));
  }
  await poolCache.evict(poolKey(sourceId));
}
