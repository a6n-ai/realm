import { sql } from "drizzle-orm";
import { type AnyPgColumn, bigint, boolean, index, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./auth";

const nextIdText = sql`(next_id())::text`;

export const invitationStatus = pgEnum("invitation_status", ["pending", "accepted", "rejected", "canceled"]);

export const organization = pgTable(
  "organization",
  {
    id: text("id").primaryKey().default(nextIdText),
    name: text("name").notNull(),
    slug: text("slug").unique(),
    logo: text("logo"),
    metadata: text("metadata"),
    clientCode: text("client_code").notNull(),
    parentOrganizationId: text("parent_organization_id").references((): AnyPgColumn => organization.id),
    region: text("region"),
    city: text("city"),
    address: text("address"),
    timezone: text("timezone"),
    currency: text("currency"),
    isDefaultLocation: boolean("is_default_location").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("organization_client_code_unique").on(t.clientCode),
    index("organization_parent_idx").on(t.parentOrganizationId),
    uniqueIndex("organization_default_location_unique").on(t.isDefaultLocation).where(sql`is_default_location = true`),
  ],
);

export const member = pgTable(
  "member",
  {
    id: text("id").primaryKey().default(nextIdText),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: bigint("user_id", { mode: "bigint" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("member_org_user_unique").on(t.organizationId, t.userId),
    index("member_user_idx").on(t.userId),
  ],
);

export const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey().default(nextIdText),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: invitationStatus("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    inviterId: bigint("inviter_id", { mode: "bigint" })
      .notNull()
      .references(() => users.id),
    // better-auth's organization plugin writes createdAt on every invitation;
    // without this column createInvitation throws at the adapter layer.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("invitation_org_idx").on(t.organizationId), index("invitation_email_idx").on(t.email)],
);
