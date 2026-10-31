import { baseColumns, updatableColumns } from "@foundry/database";
import { bigint, boolean, integer, jsonb, pgTable, text, unique } from "drizzle-orm/pg-core";
import { users } from "./auth";

// One row per "Give coins" run: the filters used, the amount, and the outcome
// counts. contactListPublicId links the relay list built lazily for emailing.
export const coinGrantGroups = pgTable("coin_grant_groups", {
  ...updatableColumns("cgg"),
  name: text("name").notNull(),
  filters: jsonb("filters").$type<Record<string, unknown>>().notNull(),
  coins: integer("coins").notNull(),
  memo: text("memo"),
  memberCount: integer("member_count").notNull().default(0),
  awardedCount: integer("awarded_count").notNull().default(0),
  cappedCount: integer("capped_count").notNull().default(0),
  noEmailCount: integer("no_email_count").notNull().default(0),
  contactListPublicId: text("contact_list_public_id"),
});

export const coinGrantGroupMembers = pgTable("coin_grant_group_members", {
  ...baseColumns("cgm"),
  groupId: bigint("group_id", { mode: "bigint" }).notNull().references(() => coinGrantGroups.id),
  userId: bigint("user_id", { mode: "bigint" }).notNull().references(() => users.id),
  awarded: boolean("awarded").notNull(),
}, (t) => [unique("coin_grant_group_members_group_user_unique").on(t.groupId, t.userId)]);
