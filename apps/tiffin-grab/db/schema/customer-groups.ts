import { baseColumns, updatableColumns } from "@foundry/database";
import { bigint, boolean, index, integer, jsonb, pgTable, text, unique } from "drizzle-orm/pg-core";
import { users } from "./auth";

// DB tables keep their original coin_grant_* names; renaming would make drizzle-kit prompt.
// A saved set of customers. contactListPublicId links the relay list built lazily for emailing.
export const customerGroups = pgTable("coin_grant_groups", {
  ...updatableColumns("cgg"),
  name: text("name").notNull(),
  filters: jsonb("filters").$type<Record<string, unknown>>().notNull(),
  memberCount: integer("member_count").notNull().default(0),
  contactListPublicId: text("contact_list_public_id"),
  // legacy: drop after backfill into customer_group_actions
  coins: integer("coins"),
  memo: text("memo"),
  awardedCount: integer("awarded_count").notNull().default(0),
  cappedCount: integer("capped_count").notNull().default(0),
  noEmailCount: integer("no_email_count").notNull().default(0),
});

export const customerGroupMembers = pgTable("coin_grant_group_members", {
  ...baseColumns("cgm"),
  groupId: bigint("group_id", { mode: "bigint" }).notNull().references(() => customerGroups.id),
  userId: bigint("user_id", { mode: "bigint" }).notNull().references(() => users.id),
  // legacy: drop after backfill into customer_group_actions
  awarded: boolean("awarded"),
}, (t) => [unique("coin_grant_group_members_group_user_unique").on(t.groupId, t.userId)]);

// One row per thing done to a group (kind: "coins" | "email" | ...), params in, result out.
export const customerGroupActions = pgTable("customer_group_actions", {
  ...updatableColumns("cga"),
  groupId: bigint("group_id", { mode: "bigint" }).notNull().references(() => customerGroups.id),
  kind: text("kind").notNull(),
  params: jsonb("params").$type<Record<string, unknown>>().notNull().default({}),
  result: jsonb("result").$type<Record<string, unknown>>().notNull().default({}),
}, (t) => [index("customer_group_actions_group_created_idx").on(t.groupId, t.createdAt)]);
