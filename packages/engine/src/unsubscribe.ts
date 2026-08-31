import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { CampaignTables } from "./campaign-schema";
import type { NotificationTables } from "./schema";
import { normalizeAddress, suppress } from "./suppression";
import type { Channel } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;

/**
 * HMAC-signed, stateless unsubscribe token — no DB lookup to issue or verify,
 * so a bad or missing token reveals nothing about whether the address exists
 * (the response is identical either way).
 */
export function signUnsubscribeToken(secret: string, address: string): string {
  return createHmac("sha256", secret).update(normalizeAddress(address)).digest("hex");
}

export function verifyUnsubscribeToken(secret: string, address: string, token: string): boolean {
  const expected = Buffer.from(signUnsubscribeToken(secret, address), "hex");
  let given: Buffer;
  try {
    given = Buffer.from(token, "hex");
  } catch {
    return false;
  }
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Absolute unsubscribe link for a campaign footer. `baseUrl` is the app's own origin. */
export function buildUnsubscribeUrl(baseUrl: string, secret: string, address: string): string {
  const url = new URL("/unsubscribe", baseUrl);
  const normalized = normalizeAddress(address);
  url.searchParams.set("address", normalized);
  url.searchParams.set("token", signUnsubscribeToken(secret, normalized));
  return url.toString();
}

/**
 * Apply an unsubscribe. Idempotent, works for a logged-out guest (the token IS
 * the auth), and scoped to MARKETING only — a receipt for an order the person
 * actually placed is still owed to them, and withholding it is the wrong kind
 * of compliance.
 *
 * Also stamps every contact_list_member row for the address so a later import
 * of the same list cannot silently resurrect them.
 */
export async function handleUnsubscribe(
  db: Db,
  tables: NotificationTables & CampaignTables,
  input: { address: string | null; token: string | null; secret: string; channel?: Channel },
): Promise<void> {
  const { address, token, secret } = input;
  if (!address || !token || !verifyUnsubscribeToken(secret, address, token)) return;

  const normalized = normalizeAddress(address);
  const channel: Channel = input.channel ?? (normalized.includes("@") ? "email" : "sms");

  await suppress(db, tables, {
    address: normalized,
    channel,
    reason: "unsubscribe",
    scope: "marketing",
  });

  const column = channel === "email" ? tables.contactListMember.email : tables.contactListMember.phone;
  await db
    .update(tables.contactListMember)
    .set({ unsubscribedAt: Date.now() })
    .where(and(eq(column, normalized), isNull(tables.contactListMember.unsubscribedAt)));
}
