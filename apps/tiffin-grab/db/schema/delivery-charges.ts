import { updatableColumns } from "@foundry/database";
import { bigint, boolean, index, integer, numeric, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { organization } from "./organizations";

export const deliveryChargeType = pgEnum("delivery_charge_type", ["none", "fixed", "percent"]);
export type DeliveryChargeTypeValue = (typeof deliveryChargeType.enumValues)[number];

export const deliveryChargeConfigs = pgTable("delivery_charge_configs", {
  ...updatableColumns("dcc"),
  baseCharge: numeric("base_charge", { precision: 10, scale: 2 }).notNull().default("0.00"),
  organizationId: text("organization_id").references(() => organization.id),
}, (t) => [
  index("delivery_charge_configs_org_idx").on(t.organizationId),
]);

export const deliveryTags = pgTable("delivery_tags", {
  ...updatableColumns("dtg"),
  name: text("name").notNull(),
  description: text("description"),
  chargeType: deliveryChargeType("charge_type").notNull().default("none"),
  chargeValue: numeric("charge_value", { precision: 10, scale: 2 }).notNull().default("0.00"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  organizationId: text("organization_id").references(() => organization.id),
}, (t) => [
  uniqueIndex("delivery_tags_name_unique").on(t.name),
  index("delivery_tags_active_idx").on(t.active),
  index("delivery_tags_org_idx").on(t.organizationId),
]);

export const deliveryOptions = pgTable("delivery_options", {
  ...updatableColumns("dop"),
  tagId: bigint("tag_id", { mode: "bigint" }).references(() => deliveryTags.id),
  name: text("name").notNull(),
  description: text("description"),
  chargeType: deliveryChargeType("charge_type").notNull().default("none"),
  chargeValue: numeric("charge_value", { precision: 10, scale: 2 }).notNull().default("0.00"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  organizationId: text("organization_id").references(() => organization.id),
}, (t) => [
  uniqueIndex("delivery_options_name_tag_unique").on(t.name, t.tagId),
  index("delivery_options_tag_idx").on(t.tagId),
  index("delivery_options_active_idx").on(t.active),
  index("delivery_options_org_idx").on(t.organizationId),
]);

// Backward compatibility exports during transition
// Backward compatibility exports during transition
export const addressTags = deliveryTags;

