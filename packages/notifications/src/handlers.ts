import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { CampaignTables } from "./campaign-schema";
import type { NotificationTables } from "./schema";
import {
  appendUnsubscribeFooter,
  renderCampaignEmail,
  renderCampaignText,
  renderEmailForEvent,
  renderInAppForEvent,
} from "./template";
import { buildUnsubscribeUrl } from "./unsubscribe";
import type { Channel, ChannelProvider } from "./types";
import type { UsersRef } from "./enqueue";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OutboxRow = any;

export interface BroadcastInput {
  userId: bigint;
  publicId: string;
  event: string | null;
  title: string;
  body: string;
  href: string | null;
}

/** Realtime push transport, injected: RabbitMQ/AppSync in tiffin-grab, SSE in puchkaman. */
export type BroadcastFn = (input: BroadcastInput) => Promise<void>;

/**
 * Delivers one outbox row. Returns the provider id on send, or `null` to SKIP
 * when no DB template exists for this event/channel — the DB template is the
 * single source of truth, so an absent template means the channel is silently
 * not delivered (the drainer records the skip).
 */
export type ChannelHandler = (row: OutboxRow) => Promise<{ providerMessageId: string } | null>;

type LoadUser = (
  id: bigint,
) => Promise<{ email: string | null; phone: string | null; locale: string } | undefined>;

/**
 * Address resolution, factored out so it is testable without a database.
 * The literal column wins over the user row: for an imported contact there is
 * no user row at all, and for a user whose address changed after the row was
 * queued the stored address is the one consent was given for.
 */
export async function resolveRecipientAddress(
  row: { recipientId: bigint | null; recipientEmail: string | null; recipientPhone: string | null },
  channel: Channel,
  loadUser: LoadUser,
): Promise<{ address: string; locale: string } | null> {
  const literal = channel === "email" ? row.recipientEmail : row.recipientPhone;
  if (literal) return { address: literal, locale: "en" };
  if (row.recipientId === null) return null;
  const user = await loadUser(row.recipientId);
  const address = channel === "email" ? user?.email : user?.phone;
  if (!address) return null;
  return { address, locale: user?.locale ?? "en" };
}

export interface HandlerDeps {
  db: Db;
  tables: NotificationTables;
  users: UsersRef;
  providers: Partial<Record<Channel, ChannelProvider>>;
  broadcast: BroadcastFn;
  /**
   * Campaign tables + the footer every commercial message must carry. Omitted,
   * campaign rows are skipped rather than sent without an unsubscribe link.
   */
  campaigns?: {
    tables: CampaignTables;
    unsubscribe: { baseUrl: string; secret: string };
    sender: { name: string; postalAddress: string };
  };
}

function payloadParts(row: OutboxRow) {
  const p = row.payload as { href?: string | null; vars?: Record<string, unknown> };
  return { href: p.href ?? null, vars: p.vars ?? {} };
}

export function buildHandlers(deps: HandlerDeps): Record<Channel, ChannelHandler | undefined> {
  const { db, tables, users, providers, broadcast } = deps;

  const loadUser: LoadUser = async (id) => {
    const select: Record<string, unknown> = { email: users.columns.email };
    if (users.columns.phone) select.phone = users.columns.phone;
    // `locale` is read off the users table by name; both apps have it after Plan B.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select.locale = (users.table as any).locale;
    const [row] = await db
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select(select as any)
      .from(users.table)
      .where(eq(users.columns.id, id));
    if (!row) return undefined;
    return {
      email: (row.email as string | null) ?? null,
      phone: (row.phone as string | null) ?? null,
      locale: (row.locale as string | null) ?? "en",
    };
  };

  /** in_app: render the DB template; no template → skip. Insert feed row + broadcast. */
  const inApp: ChannelHandler = async (row) => {
    if (row.recipientId === null) return null; // no feed without an account
    const { href, vars } = payloadParts(row);
    const user = await loadUser(row.recipientId);
    const locale = user?.locale ?? "en";
    // A campaign row carries no event and empty payload title/body — its copy
    // lives in campaign_content, so rendering from the payload would insert a
    // blank feed row.
    const rendered =
      row.campaignId && deps.campaigns
        ? await renderCampaignText(db, deps.campaigns.tables, row.campaignId, "in_app", locale, vars)
        : row.event
          ? await renderInAppForEvent(db, tables, row.event, locale, vars)
          : { title: row.payload.title as string, body: row.payload.body as string };
    if (!rendered) return null;

    const [n] = await db
      .insert(tables.notifications)
      .values({
        userId: row.recipientId,
        event: row.event,
        title: rendered.title,
        body: rendered.body,
        href,
      })
      .returning({ publicId: tables.notifications.publicId });

    // Publish-after-commit: the feed row is durable above; the live ping is best-effort.
    await broadcast({
      userId: row.recipientId,
      publicId: n.publicId as string,
      event: row.event,
      title: rendered.title,
      body: rendered.body,
      href,
    });

    return { providerMessageId: n.publicId as string };
  };

  const viaProvider = (channel: Channel): ChannelHandler | undefined => {
    const provider = providers[channel];
    if (!provider) return undefined;
    return async (row) => {
      const { vars } = payloadParts(row);
      const target = await resolveRecipientAddress(row, channel, loadUser);
      if (!target) return null;

      if (channel === "email") {
        let rendered: { subject: string; html: string; text: string } | null = null;
        if (row.campaignId && deps.campaigns) {
          const base = await renderCampaignEmail(
            db,
            deps.campaigns.tables,
            row.campaignId,
            target.locale,
            vars,
          );
          if (base) {
            const { unsubscribe, sender } = deps.campaigns;
            rendered = {
              subject: base.subject,
              ...appendUnsubscribeFooter(base, {
                url: buildUnsubscribeUrl(unsubscribe.baseUrl, unsubscribe.secret, target.address),
                sender: sender.name,
                address: sender.postalAddress,
              }),
            };
          }
        } else if (row.event) {
          rendered = await renderEmailForEvent(db, tables, row.event, target.locale, vars);
        }
        if (!rendered) return null; // no DB template → don't send
        return provider.send({
          to: { email: target.address },
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        });
      }

      // sms / whatsapp: body text plus an optional provider-side template id.
      if (row.campaignId && deps.campaigns) {
        const c = await renderCampaignText(
          db,
          deps.campaigns.tables,
          row.campaignId,
          channel,
          target.locale,
          vars,
        );
        if (!c) return null;
        return provider.send({
          to: { phone: target.address },
          text: c.body,
          providerTemplateId: c.providerTemplateId ?? undefined,
          vars,
        });
      }
      const rendered = row.event
        ? await renderInAppForEvent(db, tables, row.event, target.locale, vars)
        : null;
      if (!rendered) return null;
      return provider.send({ to: { phone: target.address }, text: rendered.body, vars });
    };
  };

  return {
    in_app: inApp,
    email: viaProvider("email"),
    sms: viaProvider("sms"),
    whatsapp: viaProvider("whatsapp"),
  };
}
