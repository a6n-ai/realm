import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { resolveChannels, type PrefRow } from "./policy";
import { suppressedChannelsFor } from "./suppression";
import type { TenantNotificationTables } from "./tenant-schema";
import type { Channel, Kind } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;

export interface TenantEnqueueInput {
  tenantId: bigint;
  event?: string;
  recipientExternalId?: string;
  recipientEmail?: string;
  recipientPhone?: string;
  title: string;
  body: string;
  href?: string;
  data?: Record<string, unknown>;
  channels?: Channel[];
  kind?: Kind;
  campaignId?: bigint;
  dedupeKey?: string;
}

/**
 * Enqueue for a Relay tenant. Recipients are addresses / external ids, never
 * operator user rows. Prefs are per (tenant, externalUserId) when present.
 */
export async function enqueueTenant(
  tx: Db,
  tables: TenantNotificationTables,
  input: TenantEnqueueInput,
): Promise<void> {
  const wanted = input.channels ?? ["email"];
  const kind = input.kind ?? "transactional";
  const email = input.recipientEmail;
  const phone = input.recipientPhone;

  let prefs: PrefRow[] = [];
  if (input.recipientExternalId) {
    prefs = (await tx
      .select({
        channel: tables.notificationPrefs.channel,
        kind: tables.notificationPrefs.kind,
        enabled: tables.notificationPrefs.enabled,
      })
      .from(tables.notificationPrefs)
      .where(and(
        eq(tables.notificationPrefs.tenantId, input.tenantId),
        eq(tables.notificationPrefs.externalUserId, input.recipientExternalId),
      ))) as PrefRow[];
  }

  const suppressed = await suppressedChannelsFor(
    tx,
    tables as never,
    [email, phone].filter(Boolean) as string[],
    kind,
  );
  const allowed = resolveChannels(wanted, prefs, { kind, suppressed });
  if (allowed.length === 0) return;

  const payload = { title: input.title, body: input.body, href: input.href ?? null, vars: input.data ?? {} };

  await tx
    .insert(tables.notificationOutbox)
    .values(
      allowed.map((channel) => ({
        tenantId: input.tenantId,
        recipientId: null,
        recipientExternalId: input.recipientExternalId ?? null,
        recipientEmail: email ?? null,
        recipientPhone: phone ?? null,
        channel,
        kind,
        event: input.event ?? null,
        campaignId: input.campaignId ?? null,
        payload,
        dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${channel}` : null,
      })),
    )
    .onConflictDoNothing({ target: tables.notificationOutbox.dedupeKey });
}
