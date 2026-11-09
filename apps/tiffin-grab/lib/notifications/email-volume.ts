import { DAY_MS } from "@foundry/commons/util/dates";
import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import type { EmailEventType, EmailStream } from "@relay/email";
import { db } from "@/db/client";
import { sharedCache } from "@/lib/cache";
import { notificationOutbox as o } from "@/db/schema";
import { getTrackedEmailEvents } from "@/lib/services/app-settings.service";

type Volume = Partial<Record<EmailEventType, number>>;
export interface VolumeRow {
  event: string | null;
  campaign: boolean;
  send: number;
  delivery: number;
  delivery_delay: number;
  open: number;
  click: number;
  bounce: number;
  complaint: number;
  reject: number;
  rendering_failure: number;
}

const KEYS = ["send", "delivery", "delivery_delay", "open", "click", "bounce", "complaint", "reject", "rendering_failure"] as const;

/** Campaign sends use the marketing stream; otherwise the event's tracked setting picks the stream. */
export function rollupVolume(rows: VolumeRow[], tracked: Set<string>, streams: EmailStream[]): Record<string, Volume> {
  const out: Record<string, Volume> = Object.fromEntries(streams.map((s) => [s.id, {}]));
  for (const r of rows) {
    const kind = r.campaign ? "marketing" : r.event && tracked.has(r.event) ? "tracked" : "untracked";
    const stream = streams.find((s) => s.kind === kind);
    if (!stream) continue;
    const v = out[stream.id]!;
    for (const k of KEYS) if (r[k] > 0) v[k] = (v[k] ?? 0) + r[k];
  }
  return out;
}

const n = (cond: ReturnType<typeof isNotNull>) => sql<number>`count(*) filter (where ${cond})::int`;

const cache = sharedCache("email-volume", 10 * 60 * 1000);

/** Per-stream counts of email outbox rows stamped in the last 30 days, from the app DB (not SES). */
export function emailVolumeByStream(streams: EmailStream[], now = Date.now()): Promise<Record<string, Volume>> {
  return cache.getOrSet(streams.map((s) => `${s.id}:${s.kind}`).join(","), () => queryVolume(streams, now));
}

// ponytail: seq scan of 30 days of outbox, cached 10 min; add (channel, created_at) index in @relay/engine if it gets slow
async function queryVolume(streams: EmailStream[], now: number): Promise<Record<string, Volume>> {
  const rows = await db
    .select({
      event: o.event,
      campaign: sql<boolean>`${o.campaignId} is not null`,
      send: n(eq(o.status, "sent")),
      delivery: n(isNotNull(o.deliveredAt)),
      delivery_delay: n(isNotNull(o.delayedAt)),
      open: n(isNotNull(o.openedAt)),
      click: n(isNotNull(o.clickedAt)),
      bounce: n(isNotNull(o.bouncedAt)),
      complaint: n(isNotNull(o.complainedAt)),
      reject: n(isNotNull(o.rejectedAt)),
      rendering_failure: n(isNotNull(o.renderFailedAt)),
    })
    .from(o)
    .where(and(eq(o.channel, "email"), gte(o.createdAt, now - 30 * DAY_MS)))
    .groupBy(o.event, sql`${o.campaignId} is not null`);
  return rollupVolume(rows, new Set(await getTrackedEmailEvents()), streams);
}
