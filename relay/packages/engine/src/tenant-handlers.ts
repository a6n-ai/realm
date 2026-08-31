import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { renderEmailForEvent } from "./template";
import type { TenantNotificationTables } from "./tenant-schema";
import type { Channel, ChannelProvider } from "./types";
import type { ChannelHandler, OutboxRow } from "./handlers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;

function payloadParts(row: OutboxRow) {
  const p = row.payload as { title?: string; body?: string; href?: string | null; vars?: Record<string, unknown> };
  return {
    title: typeof p.title === "string" ? p.title : "Notification",
    body: typeof p.body === "string" ? p.body : "",
    href: p.href ?? null,
    vars: p.vars ?? {},
  };
}

/**
 * Tenant drain handlers: recipients are literal addresses. In-app writes the
 * tenant feed keyed by externalUserId. Email uses a DB template when `event`
 * is set, otherwise the queued title/body.
 */
export function buildTenantHandlers(deps: {
  db: Db;
  tables: TenantNotificationTables;
  providers: Partial<Record<Channel, ChannelProvider>>;
}): Record<Channel, ChannelHandler | undefined> {
  const { db, tables, providers } = deps;

  const inApp: ChannelHandler = async (row) => {
    const externalId = row.recipientExternalId as string | null;
    if (!externalId) return null;
    const { title, body, href } = payloadParts(row);
    const [n] = await db
      .insert(tables.notifications)
      .values({
        tenantId: row.tenantId,
        externalUserId: externalId,
        event: row.event,
        title,
        body,
        href,
      })
      .returning({ publicId: tables.notifications.publicId });
    return { providerMessageId: n.publicId as string };
  };

  const emailProvider = providers.email;
  const email: ChannelHandler | undefined = emailProvider
    ? async (row) => {
        const address = row.recipientEmail as string | null;
        if (!address) return null;
        const { title, body, vars } = payloadParts(row);
        let rendered: { subject: string; html: string; text: string } | null = null;
        if (row.event) {
          rendered = await renderEmailForEvent(db, tables as never, row.event, "en", vars);
        }
        if (!rendered) {
          rendered = {
            subject: title,
            text: body,
            html: `<p>${body.replace(/</g, "&lt;")}</p>`,
          };
        }
        return emailProvider.send({
          to: { email: address },
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        });
      }
    : undefined;

  return {
    in_app: inApp,
    email,
    sms: undefined,
    whatsapp: undefined,
  };
}
