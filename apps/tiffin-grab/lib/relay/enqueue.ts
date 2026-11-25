import { inArray } from "drizzle-orm";
import { makePublicId } from "@foundry/database";
import { planOutboxRows, renderInAppForEvent, type EnqueueInput, type PrefRow } from "@relay/engine";
import { onCommit, type Tx } from "@/db/client";
import { notificationPrefs, notifications, relayOutbox, users } from "@/db/schema";
import { broadcast } from "@/lib/notifications/broadcast";
import { notificationTables } from "@/lib/notifications/tables";
import { EVENTS } from "@/lib/notifications/events";

/**
 * Flag-on enqueue. Channel rules are the engine's (planOutboxRows, same prefs and notify_email); suppression is
 * Relay's, so no local suppression lookup. Email goes to relay_outbox in the caller's transaction; in-app goes
 * to the feed, with the broadcast after commit. The caller signals the forwarder (markOutboxDirty).
 */
export async function enqueueViaRelay(tx: Tx, inputs: EnqueueInput[]): Promise<void> {
  const ids = [...new Set(inputs.flatMap((i) => (i.recipientId === undefined ? [] : [i.recipientId])))];
  const userRows = ids.length
    ? await tx
        .select({ id: users.id, email: users.email, phone: users.phone, notifyEmail: users.notifyEmail, locale: users.locale })
        .from(users)
        .where(inArray(users.id, ids))
    : [];
  const prefRows = ids.length
    ? await tx
        .select({ userId: notificationPrefs.userId, channel: notificationPrefs.channel, kind: notificationPrefs.kind, enabled: notificationPrefs.enabled })
        .from(notificationPrefs)
        .where(inArray(notificationPrefs.userId, ids))
    : [];

  const prefsByUser = new Map<string, PrefRow[]>();
  for (const p of prefRows) {
    const key = String(p.userId);
    prefsByUser.set(key, [...(prefsByUser.get(key) ?? []), { channel: p.channel, kind: p.kind, enabled: p.enabled }]);
  }
  const userById = new Map(userRows.map((u) => [String(u.id), u]));
  // Suppression is Relay's, so no local list here.
  const planned = planOutboxRows(inputs, { prefsByUser, userById, suppressions: [] });

  const emailRows: (typeof relayOutbox.$inferInsert)[] = [];
  for (const p of planned) {
    const locale = p.recipientId == null ? "en" : (userById.get(String(p.recipientId))?.locale ?? "en");
    if (p.channel === "email") {
      if (!p.recipientEmail) continue;
      const event = p.event;
      const stream = p.kind === "marketing" ? "marketing" : event && (await isTrackedEvent(event)) ? "tracked" : "transactional";
      const publicId = makePublicId("rob")();
      emailRows.push({
        publicId,
        // Dedupe key + ":email" (planOutboxRows adds the suffix). Rows without one are keyed by their own id.
        idempotencyKey: p.dedupeKey ?? publicId,
        // The column is the app_event enum; a template key outside it (menu_reminder) lives only in payload.event.
        event: (event && event in EVENTS ? event : null) as never,
        recipientId: p.recipientId,
        recipientEmail: p.recipientEmail,
        stream,
        payload: { ...p.payload, event, locale },
        status: "pending",
        nextAttemptAt: Date.now(),
        updatedAt: Date.now(),
      });
    } else if (p.channel === "in_app" && p.recipientId != null) {
      const vars = (p.payload.vars ?? {}) as Record<string, unknown>;
      // Same rule as the engine drain: an event with no in-app copy gets no feed row.
      const rendered = p.event
        ? await renderInAppForEvent(tx, notificationTables, p.event, locale, vars)
        : { title: p.payload.title as string, body: p.payload.body as string };
      if (!rendered) continue;
      const [n] = await tx
        .insert(notifications)
        .values({ userId: p.recipientId, event: p.event as never, title: rendered.title, body: rendered.body, href: p.payload.href as string | null })
        .returning({ publicId: notifications.publicId });
      const feed = { userId: p.recipientId, publicId: n!.publicId, event: p.event, title: rendered.title, body: rendered.body, href: (p.payload.href as string | null) ?? null };
      onCommit(() => broadcast(feed));
    }
  }
  if (emailRows.length) await tx.insert(relayOutbox).values(emailRows).onConflictDoNothing({ target: relayOutbox.idempotencyKey });
}

// Lazy: lib/settings sits behind this import, and loading it at module init closes a cycle
// (session-service -> ... -> notifications/enqueue -> here -> settings -> session-service).
// Relay owns the SES streams, so only the admin's tracked-event setting matters here, not TiffinGrab's SES config.
async function isTrackedEvent(event: string): Promise<boolean> {
  const [{ eventCategory }, { getTrackedEmailEvents }] = await Promise.all([
    import("@/lib/notifications/events"),
    import("@/lib/notifications/tracked-email-events"),
  ]);
  if (eventCategory(event) === "account") return false;
  return (await getTrackedEmailEvents()).includes(event);
}
