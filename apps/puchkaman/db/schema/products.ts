import { updatableColumns } from "@realm/database";
import type { FileDetail } from "@realm/storage/model";
import { boolean, jsonb, numeric, pgTable, text } from "drizzle-orm/pg-core";

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
});
