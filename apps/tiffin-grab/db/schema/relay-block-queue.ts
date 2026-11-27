import { bigint, bigserial, pgTable, text } from "drizzle-orm/pg-core";

// Block events waiting to reach Relay. Written in the same transaction as the local block, drained by pushBlocks.
export const relayBlockQueue = pgTable("relay_block_queue", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  email: text("email").notNull(),
  reason: text("reason").notNull(),
  stream: text("stream"),
  source: text("source"),
  campaignRef: text("campaign_ref"),
  campaignName: text("campaign_name"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
