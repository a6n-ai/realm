import { eq } from "drizzle-orm";
import { SesEmailProvider } from "@tiffin/commons-notify";
import { AppError } from "@tiffin/commons";
import { db } from "@/db/client";
import { notifications, notificationOutbox, users } from "@/db/schema";
import { renderEmailForEvent, renderInAppForEvent } from "./template-service";
import { broadcast } from "./broadcast";
import { publishPush } from "./rabbit";

type OutboxRow = typeof notificationOutbox.$inferSelect;
type Channel = (typeof notificationOutbox.channel.enumValues)[number];

/**
 * Delivers one outbox row. Returns the provider id on send, or `null` to SKIP
 * when no DB template exists for this event/channel — the DB template is the
 * single source of truth, so an absent template means the channel is silently
 * not delivered (the drainer records the skip).
 */
export type ChannelHandler = (row: OutboxRow) => Promise<{ providerMessageId: string } | null>;

function payloadParts(row: OutboxRow) {
  const p = row.payload as { href?: string | null; vars?: Record<string, unknown> };
  return { href: p.href ?? null, vars: p.vars ?? {} };
}

/** in_app: render the DB template; no template → skip. Insert feed row + broadcast. */
const inApp: ChannelHandler = async (row) => {
  const { href, vars } = payloadParts(row);
  const [user] = await db.select({ locale: users.locale }).from(users).where(eq(users.id, row.recipientId));
  const rendered = await renderInAppForEvent(row.event, user?.locale ?? "en", vars);
  if (!rendered) return null;
  const [n] = await db
    .insert(notifications)
    .values({ userId: row.recipientId, event: row.event, title: rendered.title, body: rendered.body, href })
    .returning({ publicId: notifications.publicId });

  // Feed row is committed above. Publish-after-commit: hand the realtime push to
  // RabbitMQ; the worker calls broadcast(). If the broker is unavailable, fall
  // back to the inline push so the live ping still fires (no regression).
  const input = { userId: row.recipientId, publicId: n.publicId, event: row.event, title: rendered.title, body: rendered.body, href };
  if (!(await publishPush(input))) await broadcast(input);

  return { providerMessageId: n.publicId };
};

/** Test-only handle onto the inApp handler. */
export const __inAppForTest = inApp;

function buildEmailHandler(): ChannelHandler {
  const provider = new SesEmailProvider({
    region: process.env.AWS_REGION,
    configurationSetName: process.env.SES_CONFIGURATION_SET,
    defaultFrom: {
      email: process.env.NOTIFY_FROM_EMAIL ?? "noreply@tiffingrab.ca",
      name: process.env.NOTIFY_FROM_NAME ?? "Tiffin Grab",
    },
  });
  return async (row) => {
    const { vars } = payloadParts(row);
    const [user] = await db
      .select({ email: users.email, locale: users.locale })
      .from(users)
      .where(eq(users.id, row.recipientId));
    if (!user?.email) throw new AppError(`Recipient ${row.recipientId} has no email`, 422);

    const rendered = await renderEmailForEvent(row.event, user.locale, vars);
    if (!rendered) return null; // no DB template → don't send

    return provider.send({ to: { email: user.email }, subject: rendered.subject, html: rendered.html, text: rendered.text });
  };
}

export function buildHandlers(): Record<Channel, ChannelHandler | undefined> {
  return {
    in_app: inApp,
    email: buildEmailHandler(),
    sms: undefined,
    whatsapp: undefined,
  };
}
