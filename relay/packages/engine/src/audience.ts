import { and, inArray, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { AudienceDef, CampaignTables } from "./campaign-schema";
import type { NotificationTables } from "./schema";
import type { UsersRef } from "./enqueue";
import { normalizeAddress } from "./suppression";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;

/**
 * CASL: consent implied by an existing business relationship (a purchase)
 * expires 24 months after the transaction. Express consent does not expire.
 */
export const IMPLIED_CONSENT_MS = 730 * 86_400_000;

export interface Recipient {
  userId?: bigint;
  email?: string;
  phone?: string;
  name?: string;
  vars?: Record<string, string>;
}

export function isConsentValid(source: string, consentAt: number, now: number): boolean {
  if (source === "purchase") return now - consentAt <= IMPLIED_CONSENT_MS;
  return true;
}

/**
 * Collapse duplicates by normalized address. An entry with a user id wins,
 * because a known customer carries preferences and a locale that a bare list
 * row does not — but the list row's merge vars are kept, since that is the only
 * place they exist.
 */
export function dedupeRecipients(input: Recipient[]): Recipient[] {
  const byKey = new Map<string, Recipient>();
  for (const r of input) {
    const key = normalizeAddress(r.email ?? r.phone ?? "");
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...r, email: r.email ? normalizeAddress(r.email) : undefined });
      continue;
    }
    byKey.set(key, {
      ...existing,
      userId: existing.userId ?? r.userId,
      name: existing.name ?? r.name,
      vars: { ...(r.vars ?? {}), ...(existing.vars ?? {}) },
    });
  }
  return [...byKey.values()];
}

export interface AudienceDeps {
  db: Db;
  tables: NotificationTables & CampaignTables;
  users: UsersRef;
  /**
   * App-specific segment query. The package cannot know what an "order" is, so
   * each app supplies a resolver that turns a segment definition into user ids.
   */
  resolveSegment: (segment: NonNullable<AudienceDef["segment"]>) => Promise<bigint[]>;
  now?: number;
}

/**
 * Resolve an audience definition into deliverable recipients.
 *
 * Exclusions applied here, in order: lapsed implied consent, unsubscribed list
 * members, and any address suppressed for marketing. The suppression check runs
 * LAST and over the final address set, so a recipient reached through both a
 * segment and a list cannot slip past it on one path.
 */
export async function resolveAudience(deps: AudienceDeps, def: AudienceDef): Promise<Recipient[]> {
  const { db, tables, users } = deps;
  const now = deps.now ?? Date.now();
  const out: Recipient[] = [];

  if (def.segment) {
    const ids = await deps.resolveSegment(def.segment);
    if (ids.length > 0) {
      const select: Record<string, unknown> = {
        id: users.columns.id,
        email: users.columns.email,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        name: (users.table as any).name,
      };
      if (users.columns.phone) select.phone = users.columns.phone;
      const rows = await db
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select(select as any)
        .from(users.table)
        .where(inArray(users.columns.id, ids));
      for (const r of rows) {
        out.push({
          userId: r.id as bigint,
          email: (r.email as string | null) ?? undefined,
          phone: (r.phone as string | null) ?? undefined,
          name: (r.name as string | null) ?? undefined,
        });
      }
    }
  }

  if (def.listIds?.length) {
    const lists = await db
      .select({
        id: tables.contactList.id,
        source: tables.contactList.consentSource,
        consentAt: tables.contactList.consentAt,
      })
      .from(tables.contactList)
      .where(inArray(tables.contactList.publicId, def.listIds));

    // A list whose implied consent has lapsed contributes nobody. Filtering the
    // whole list is correct: consent_at is a property of how the list was
    // gathered, not of an individual row.
    const live = lists.filter((l) => isConsentValid(l.source as string, Number(l.consentAt), now));

    if (live.length > 0) {
      const members = await db
        .select({
          email: tables.contactListMember.email,
          phone: tables.contactListMember.phone,
          name: tables.contactListMember.name,
          vars: tables.contactListMember.vars,
        })
        .from(tables.contactListMember)
        .where(
          and(
            inArray(
              tables.contactListMember.listId,
              live.map((l) => l.id),
            ),
            isNull(tables.contactListMember.unsubscribedAt),
          ),
        );
      for (const m of members) {
        out.push({
          email: (m.email as string | null) ?? undefined,
          phone: (m.phone as string | null) ?? undefined,
          name: (m.name as string | null) ?? undefined,
          vars: (m.vars as Record<string, string>) ?? {},
        });
      }
    }
  }

  const deduped = dedupeRecipients(out);
  if (deduped.length === 0) return [];

  const addresses = deduped
    .flatMap((r) => [r.email, r.phone].filter(Boolean) as string[])
    .map(normalizeAddress);
  const blocked = await db
    .select({ address: tables.messageSuppression.address })
    .from(tables.messageSuppression)
    .where(
      and(
        inArray(tables.messageSuppression.address, addresses),
        inArray(tables.messageSuppression.scope, ["all", "marketing"]),
      ),
    );
  const blockedSet = new Set(blocked.map((b) => b.address as string));

  return deduped.filter((r) => {
    const email = r.email ? normalizeAddress(r.email) : null;
    const phone = r.phone ? normalizeAddress(r.phone) : null;
    return !(email && blockedSet.has(email)) && !(phone && blockedSet.has(phone));
  });
}

/** Live count for the audience builder. Same exclusions as the real send. */
export async function countAudience(deps: AudienceDeps, def: AudienceDef): Promise<number> {
  return (await resolveAudience(deps, def)).length;
}
