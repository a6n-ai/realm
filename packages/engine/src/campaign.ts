import { and, eq, inArray, lte, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { AudienceDef, CampaignTables } from "./campaign-schema";
import type { NotificationTables } from "./schema";
import { resolveAudience, type AudienceDeps } from "./audience";
import { enqueue, type UsersRef } from "./enqueue";
import type { Channel } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;

const BATCH = 500;

export interface MaterializeDeps {
  db: Db;
  tables: NotificationTables & CampaignTables;
  users: UsersRef;
  resolveSegment: AudienceDeps["resolveSegment"];
}

/**
 * Expand a campaign into outbox rows.
 *
 * Idempotent by construction: the dedupe key is per (campaign, recipient) and
 * the outbox has a unique index on it, so a crash halfway through a 10k send is
 * fixed by running this again rather than by reconciliation. The status flip to
 * 'sending' happens first so the scheduler cannot pick the same campaign up
 * twice concurrently.
 */
export async function materializeCampaign(
  deps: MaterializeDeps,
  campaignPublicId: string,
): Promise<{ queued: number }> {
  const { db, tables, users } = deps;

  const claimed = await db
    .update(tables.campaign)
    .set({ status: "sending" })
    .where(
      and(
        eq(tables.campaign.publicId, campaignPublicId),
        inArray(tables.campaign.status, ["draft", "scheduled", "sending"]),
      ),
    )
    .returning({
      id: tables.campaign.id,
      audience: tables.campaign.audience,
      channels: tables.campaign.channels,
    });

  const campaign = claimed[0];
  if (!campaign) return { queued: 0 };

  const recipients = await resolveAudience(
    { db, tables, users, resolveSegment: deps.resolveSegment },
    campaign.audience as AudienceDef,
  );

  let queued = 0;
  for (let i = 0; i < recipients.length; i += BATCH) {
    const slice = recipients.slice(i, i + BATCH);
    // One transaction per batch, not per campaign: a single transaction over
    // 10k recipients would hold locks for minutes and block the drainer.
    await db.transaction(async (tx) => {
      for (const r of slice) {
        await enqueue(tx, tables, users, {
          recipientId: r.userId,
          recipientEmail: r.email,
          recipientPhone: r.phone,
          title: "",
          body: "",
          kind: "marketing",
          campaignId: campaign.id as bigint,
          channels: campaign.channels as Channel[],
          data: { contact: { name: r.name ?? "", ...(r.vars ?? {}) } },
          dedupeKey: `cmp:${campaignPublicId}:${(r.email ?? r.phone ?? "").toLowerCase()}`,
        });
        queued += 1;
      }
    });
  }

  await db
    .update(tables.campaign)
    .set({
      status: "sent",
      sentAt: Date.now(),
      counts: sql`${tables.campaign.counts} || ${JSON.stringify({ queued })}::jsonb`,
    })
    .where(eq(tables.campaign.id, campaign.id));

  return { queued };
}

/** Scheduled campaigns whose time has come. */
export async function dueCampaigns(
  db: Db,
  tables: CampaignTables,
  now: number = Date.now(),
): Promise<string[]> {
  const rows = await db
    .select({ publicId: tables.campaign.publicId })
    .from(tables.campaign)
    .where(and(eq(tables.campaign.status, "scheduled"), lte(tables.campaign.scheduledAt, now)));
  return rows.map((r) => r.publicId as string);
}
