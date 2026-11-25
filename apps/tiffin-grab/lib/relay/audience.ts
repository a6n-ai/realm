import { and, asc, eq, gt, inArray, isNotNull, ne, max } from "drizzle-orm";
import { db } from "@/db/client";
import { customerGroupMembers, customerGroups, orders, payments, users } from "@/db/schema";
import { resolveSegment } from "@/lib/campaigns/segment";
import { activeCustomers } from "@/lib/notifications/active-customers";
import { PAID } from "@/lib/payments/status";

// Mirrors relay-v2 core/audience-hook.ts (HookRecipient, AudiencePage); copied, not imported.
export type HookRecipient = {
  email: string;
  firstName?: string;
  lastName?: string;
  consent: "implied";
  consentAt: number;
};
export type AudiencePage = { recipients: HookRecipient[]; nextCursor: string | null };

const HOOK_LIMIT = 500;
const EMPTY: AudiencePage = { recipients: [], nextCursor: null };

async function audienceIds(audience: string): Promise<bigint[] | null> {
  if (audience === "active_customers") return (await activeCustomers()).map((r) => r.userId);
  if (audience.startsWith("group:")) {
    const publicId = audience.slice("group:".length);
    return db
      .select({ userId: customerGroupMembers.userId })
      .from(customerGroupMembers)
      .innerJoin(customerGroups, eq(customerGroups.id, customerGroupMembers.groupId))
      .where(eq(customerGroups.publicId, publicId))
      .then((rows) => rows.map((r) => r.userId));
  }
  if (audience.startsWith("segment:")) {
    try {
      return await resolveSegment(JSON.parse(audience.slice("segment:".length)));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * One page of the audience Relay pulls for a campaign. Relay never rechecks notifyEmail, so every
 * filter here is the send rule. Consent is "implied" by a purchase: the latest paid order's created_at (Relay applies the
 * 730-day rule). A customer with no paid order has no implied consent, so is left out.
 */
export async function resolveAudiencePage(audience: string | null, cursor: string | null, limit: number): Promise<AudiencePage> {
  if (!audience) return EMPTY;
  let after = 0n;
  if (cursor !== null) {
    try {
      after = BigInt(cursor);
    } catch {
      return EMPTY;
    }
  }
  const ids = await audienceIds(audience);
  if (!ids || ids.length === 0) return EMPTY;

  const size = Math.min(Math.max(1, Math.floor(limit)), HOOK_LIMIT);
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(
      and(
        inArray(users.id, ids),
        gt(users.id, after),
        eq(users.status, "active"),
        eq(users.notifyEmail, true),
        isNotNull(users.email),
        ne(users.email, ""),
      ),
    )
    .orderBy(asc(users.id))
    .limit(size + 1);

  const hasMore = rows.length > size;
  const page = rows.slice(0, size);
  if (page.length === 0) return EMPTY;

  const paid = await db
    .select({ userId: orders.userId, at: max(orders.createdAt) })
    .from(orders)
    .innerJoin(payments, eq(payments.orderId, orders.id))
    .where(and(inArray(orders.userId, page.map((r) => r.id)), inArray(payments.status, [...PAID])))
    .groupBy(orders.userId);
  const paidAt = new Map(paid.map((r) => [String(r.userId), Number(r.at)]));

  const recipients = page.flatMap((u): HookRecipient[] => {
    const consentAt = paidAt.get(String(u.id));
    if (consentAt === undefined) return [];
    const name = u.name?.trim();
    const space = name?.indexOf(" ") ?? -1;
    return [
      {
        email: u.email!,
        ...(name ? { firstName: space < 0 ? name : name.slice(0, space), ...(space < 0 ? {} : { lastName: name!.slice(space + 1).trim() }) } : {}),
        consent: "implied",
        consentAt,
      },
    ];
  });
  return { recipients, nextCursor: hasMore ? String(page[page.length - 1]!.id) : null };
}
