import { updatableColumns } from "@foundry/database";
import { bigint, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

export const tenants = pgTable("tenants", {
  ...updatableColumns("tnt"),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
}, (t) => [
  uniqueIndex("tenants_slug_unique").on(t.slug),
]);

export const apiKeys = pgTable("api_keys", {
  ...updatableColumns("apk"),
  tenantId: bigint("tenant_id", { mode: "bigint" }).notNull().references(() => tenants.id),
  name: text("name").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  keyHash: text("key_hash").notNull(),
  scopes: text("scopes").notNull().default("messages:write"),
  revokedAt: bigint("revoked_at", { mode: "number" }),
}, (t) => [
  uniqueIndex("api_keys_hash_unique").on(t.keyHash),
  index("api_keys_prefix_idx").on(t.keyPrefix),
]);
