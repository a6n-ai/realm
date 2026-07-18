import { updatableColumns } from "@realm/database";
import type { FileDetail } from "@realm/storage/model";
import { bigint, boolean, integer, jsonb, numeric, pgEnum, pgTable, text } from "drizzle-orm/pg-core";

export const productSource = pgEnum("product_source", ["manual", "uber_eats"]);
export const productSyncStatus = pgEnum("product_sync_status", ["none", "synced", "update_available"]);

// Candidate values from the most recent sync that differ from the live row —
// only populated fields represent an actual diff. imageUrl is a raw source
// URL (preview only) until the admin applies it, at which point it's
// downloaded and re-hosted — the public site never reads this column.
export type PendingSync = {
  name?: string;
  description?: string | null;
  price?: number;
  imageUrl?: string | null;
  fetchedAt: string;
};

export const products = pgTable("products", {
  ...updatableColumns("prd"),
  name: text("name").notNull(),
  description: text("description"),
  // Soft ref into lib/menu-categories.ts — no DB FK, validated at the zod layer.
  category: text("category").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  image: jsonb("image").$type<FileDetail>(),
  // "best" | "viral" | "new" badges, matching the pre-existing static menu.
  tags: text("tags").array(),
  active: boolean("active").notNull().default(true),
  slug: text("slug").unique(),
  displayOrder: integer("display_order").notNull().default(0),
  featured: boolean("featured").notNull().default(false),
  // Sync bookkeeping (see lib/sync/menu-sync.service.ts) — manual products never
  // touch these beyond their defaults.
  source: productSource("source").notNull().default("manual"),
  externalId: text("external_id").unique(),
  lastSyncedAt: bigint("last_synced_at", { mode: "number" }),
  syncStatus: productSyncStatus("sync_status").notNull().default("none"),
  pendingSync: jsonb("pending_sync").$type<PendingSync>(),
  // The source image URL that produced the currently-hosted `image` — kept
  // only to detect "did the photo change" on the next sync. Never read for
  // display; the public site and admin always render `image.url` (our own
  // storage), not this.
  lastSyncedImageUrl: text("last_synced_image_url"),
});
