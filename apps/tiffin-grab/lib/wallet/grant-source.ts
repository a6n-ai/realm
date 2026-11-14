import { alias } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { customerGroups, walletLedger } from "@/db/schema";

/** wallet_ledger.sourceId of a saved-group grant to one customer: `grant:<action public id>:<user id>`. */
export const grantSourceId = (actionPublicId: string, userId: bigint | number | string) => `grant:${actionPublicId}:${userId}`;

export const grantActionId = sql`split_part(${walletLedger.sourceId}, ':', 2)`;
// Legacy grants stored the GROUP public id (not an action id) in that segment.
export const legacyGroup = alias(customerGroups, "legacy_group");
export const grantGroupName = sql<string | null>`coalesce(${customerGroups.name}, ${legacyGroup.name})`;
export const grantGroupPublicId = sql<string | null>`coalesce(${customerGroups.publicId}, ${legacyGroup.publicId})`;
