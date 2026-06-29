import { eq } from "drizzle-orm";
import { SesEmailProvider } from "@tiffin/commons-notify";
import { AppError } from "@tiffin/commons";
import { db } from "@/db/client";
import { notifications, notificationOutbox, users } from "@/db/schema";
import { renderEmailForEvent, renderInAppForEvent } from "./template-service";
import { renderEmailTemplate } from "./render-email";
import { broadcast } from "./broadcast";

type OutboxRow = typeof notificationOutbox.$inferSelect;
type Channel = (typeof notificationOutbox.channel.enumValues)[number];

/** A channel handler delivers one outbox row and returns the provider id. */
export type ChannelHandler = (row: OutboxRow) => Promise<{ providerMessageId: string }>;

function payloadParts(row: OutboxRow) {
  const p = row.payload as { title?: string; body?: string; href?: string | null; vars?: Record<string, unknown> };
  return { title: p.title ?? "", body: p.body ?? "", href: p.href ?? null, vars: p.vars ?? {} };
}

/** in_app: render from the DB template (or generic title/body), insert the feed
 *  row, then broadcast it over AppSync. */
const inApp: ChannelHandler = async (row) => {
  const { title, body, href, vars } = payloadParts(row);
  const [user] = await db.select({ locale: users.locale }).from(users).where(eq(users.id, row.recipientId));
  const rendered = (await renderInAppForEvent(row.event, user?.locale ?? "en", vars)) ?? { title, body };
  const [n] = await db
    .insert(notifications)
    .values({ userId: row.recipientId, event: row.event, title: rendered.title, body: rendered.body, href })
    .returning({ publicId: notifications.publicId });
  await broadcast({ userId: row.recipientId, publicId: n.publicId, event: row.event, title: rendered.title, body: rendered.body, href });
  return { providerMessageId: n.publicId };
};

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
    const [user] = await db
      .select({ email: users.email, locale: users.locale })
      .from(users)
      .where(eq(users.id, row.recipientId));
    if (!user?.email) throw new AppError(`Recipient ${row.recipientId} has no email`, 422);

    const { title, body, vars } = payloadParts(row);
    const rendered =
      (await renderEmailForEvent(row.event, user.locale, vars)) ??
      (await renderEmailTemplate({ subject: title, body, vars })); // generic fallback

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
