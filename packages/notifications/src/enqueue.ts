import { and, eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { resolveChannels, type PrefRow } from "./policy";
import type { NotificationTables } from "./schema";
import { suppressedChannelsFor } from "./suppression";
import type { Channel, Kind } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;

/** Default channels per kind when the caller does not name them explicitly. */
const DEFAULT_CHANNELS: Channel[] = ["in_app"];

export interface EnqueueInput {
  event?: string;
  /** Either a user id, or a literal address for a recipient with no account. */
  recipientId?: bigint;
  recipientEmail?: string;
  recipientPhone?: string;
  /** Shown in the in-app feed and used by the email template. */
  title: string;
  body: string;
  href?: string;
  /** Extra render data for templates. */
  data?: Record<string, unknown>;
  channels?: Channel[];
  kind?: Kind;
  campaignId?: bigint;
  /** Idempotency base; suffixed per channel so the same event enqueues once. */
  dedupeKey?: string;
}

/**
 * The app's users table, narrowed to the columns enqueue reads. Passed in
 * rather than imported so the package stays app-agnostic; `notifyEmail` and
 * `phone` are optional because not every app has them (puchkaman has no
 * notifyEmail column; tiffin-grab has no phone).
 */
export interface UsersRef {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: { id: any; email: any; role?: any; status?: any; notifyEmail?: any; phone?: any };
}

/**
 * Write one outbox row per resolved (recipient, channel), inside the caller's
 * transaction so the notification commits atomically with the business change.
 *
 * Channel resolution = requested channels ∩ user prefs for this kind, minus any
 * channel suppressed for the recipient's addresses. Missing pref row =
 * channel allowed (default-on).
 */
export async function enqueue(
  tx: Db,
  tables: NotificationTables,
  users: UsersRef,
  input: EnqueueInput,
): Promise<void> {
  const wanted = input.channels ?? DEFAULT_CHANNELS;
  const kind = input.kind ?? "transactional";

  let prefs: PrefRow[] = [];
  let email = input.recipientEmail;
  let phone = input.recipientPhone;
  let notifyEmail: boolean | undefined;

  if (input.recipientId !== undefined) {
    prefs = (await tx
      .select({
        channel: tables.notificationPrefs.channel,
        kind: tables.notificationPrefs.kind,
        enabled: tables.notificationPrefs.enabled,
      })
      .from(tables.notificationPrefs)
      .where(eq(tables.notificationPrefs.userId, input.recipientId))) as PrefRow[];

    const select: Record<string, unknown> = { email: users.columns.email };
    if (users.columns.notifyEmail) select.notifyEmail = users.columns.notifyEmail;
    if (users.columns.phone) select.phone = users.columns.phone;
    const [user] = await tx
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select(select as any)
      .from(users.table)
      .where(eq(users.columns.id, input.recipientId));
    email = email ?? (user?.email as string | undefined);
    phone = phone ?? (user?.phone as string | undefined);
    notifyEmail = user?.notifyEmail as boolean | undefined;
  }

  const suppressed = await suppressedChannelsFor(
    tx,
    tables,
    [email, phone].filter(Boolean) as string[],
    kind,
  );
  const allowed = resolveChannels(wanted, prefs, { kind, suppressed, notifyEmail });
  if (allowed.length === 0) return;

  // vars = entity-field snapshot used by templates; title/body feed the generic fallback.
  const payload = { title: input.title, body: input.body, href: input.href ?? null, vars: input.data ?? {} };

  await tx
    .insert(tables.notificationOutbox)
    .values(
      allowed.map((channel) => ({
        recipientId: input.recipientId ?? null,
        recipientEmail: email ?? null,
        recipientPhone: phone ?? null,
        channel,
        kind,
        event: (input.event ?? null) as never,
        campaignId: input.campaignId ?? null,
        payload,
        dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${channel}` : null,
      })),
    )
    .onConflictDoNothing({ target: tables.notificationOutbox.dedupeKey });
}

export interface EnqueueToRoleInput
  extends Omit<EnqueueInput, "recipientId" | "recipientEmail" | "recipientPhone"> {
  roles: string[];
}

/**
 * Fan an event out to every active user holding one of `roles`.
 *
 * Needed because puchkaman customers are guests who cannot log in: staff-facing
 * events ("a new order arrived") have no single recipient, and an in-app
 * notification addressed to a customer would have nowhere to appear.
 */
export async function enqueueToRole(
  tx: Db,
  tables: NotificationTables,
  users: UsersRef,
  input: EnqueueToRoleInput,
): Promise<void> {
  if (!users.columns.role || !users.columns.status) {
    throw new Error("enqueueToRole requires users.role and users.status columns");
  }
  const staff = await tx
    .select({ id: users.columns.id })
    .from(users.table)
    .where(and(inArray(users.columns.role, input.roles), eq(users.columns.status, "active")));

  for (const s of staff) {
    await enqueue(tx, tables, users, {
      ...input,
      recipientId: s.id as bigint,
      // Per-recipient dedupe suffix: one shared key would let the first staff
      // row win the unique index and silently drop everyone else.
      dedupeKey: input.dedupeKey ? `${input.dedupeKey}:u${s.id}` : undefined,
    });
  }
}
