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

export const deliveryTypes = pgTable("delivery_types", {
  ...updatableColumns("dtp"),
  name: text("name").notNull(),
  description: text("description"),
  chargeType: deliveryChargeType("charge_type").notNull().default("none"),
  chargeValue: numeric("charge_value", { precision: 10, scale: 2 }).notNull().default("0.00"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  organizationId: text("organization_id").references(() => organization.id),
}, (t) => [
  uniqueIndex("delivery_types_name_unique").on(t.name),
  index("delivery_types_active_idx").on(t.active),
  index("delivery_types_org_idx").on(t.organizationId),
]);

export const addressTags = pgTable("address_tags", {
  ...updatableColumns("atg"),
  name: text("name").notNull(),
  description: text("description"),
  chargeType: deliveryChargeType("charge_type").notNull().default("none"),
  chargeValue: numeric("charge_value", { precision: 10, scale: 2 }).notNull().default("0.00"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  organizationId: text("organization_id").references(() => organization.id),
}, (t) => [
  uniqueIndex("address_tags_name_unique").on(t.name),
  index("address_tags_active_idx").on(t.active),
  index("address_tags_org_idx").on(t.organizationId),
]);
