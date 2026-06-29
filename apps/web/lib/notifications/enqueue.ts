import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationOutbox, notificationPrefs, users } from "@/db/schema";
import { resolveChannels } from "./policy";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Channel = (typeof notificationOutbox.channel.enumValues)[number];
type Event = (typeof notificationOutbox.event.enumValues)[number];

/** Default channels per event. enqueue() intersects this with user prefs.
 *  Events not listed here fall back to DEFAULT_CHANNELS. */
const EVENT_CHANNELS: Partial<Record<Event, Channel[]>> = {
  order_activated: ["email", "in_app"],
  order_cancelled: ["email", "in_app"],
  menu_released: ["email", "in_app"],
  payment_received: ["email", "in_app"],
  wallet_credited: ["in_app"],
  ticket_reply: ["email", "in_app"],
  inquiry_follow_up: ["in_app"],
};

const DEFAULT_CHANNELS: Channel[] = ["in_app"];

export interface EnqueueInput {
  event: Event;
  recipientId: bigint;
  /** Shown in the in-app feed and used by the email template. */
  title: string;
  body: string;
  href?: string;
  /** Extra render data for templates. */
  data?: Record<string, unknown>;
  /** Override the default channel set for this event. */
  channels?: Channel[];
  /** Idempotency base; suffixed per channel so the same event enqueues once. */
  dedupeKey?: string;
}

/**
 * Write one outbox row per resolved (recipient, channel), inside the caller's
 * transaction so the notification commits atomically with the business change.
 * Channel resolution = event defaults ∩ user prefs (enabled, not suppressed).
 * Missing pref row = channel allowed (default-on).
 */
export async function enqueue(tx: Tx, input: EnqueueInput): Promise<void> {
  const wanted = input.channels ?? EVENT_CHANNELS[input.event] ?? DEFAULT_CHANNELS;

  const prefs = await tx
    .select({
      channel: notificationPrefs.channel,
      enabled: notificationPrefs.enabled,
      suppressed: notificationPrefs.suppressed,
    })
    .from(notificationPrefs)
    .where(eq(notificationPrefs.userId, input.recipientId));

  const [user] = await tx
    .select({ notifyEmail: users.notifyEmail })
    .from(users)
    .where(eq(users.id, input.recipientId));

  const allowed = resolveChannels(wanted, prefs, { notifyEmail: user?.notifyEmail ?? true });
  if (allowed.length === 0) return;

  const payload = { title: input.title, body: input.body, href: input.href ?? null, ...input.data };

  await tx
    .insert(notificationOutbox)
    .values(
      allowed.map((channel) => ({
        recipientId: input.recipientId,
        channel,
        event: input.event,
        payload,
        dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${channel}` : null,
      })),
    )
    .onConflictDoNothing({ target: notificationOutbox.dedupeKey });
}
