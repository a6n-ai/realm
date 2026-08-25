import { sql } from "drizzle-orm";
import { type AnyPgColumn, bigint, boolean, index, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { IntegrationsConfig } from "@realm/clover";
import { users } from "./auth";

const nextIdText = sql`(next_id())::text`;

export const invitationStatus = pgEnum("invitation_status", ["pending", "accepted", "rejected", "canceled"]);

// Better Auth `organization` plugin table, extended with the client-hierarchy fields
// this app needs (docs/superpowers/plans/2026-08-25-puchkaman-org-hierarchy.md).
// clientCode is a business identifier — distinct from `slug`, which stays an
// auth-routing concern. Settings columns mirror apps/puchkaman/db/schema/app.ts's
// real column set (smaller than tiffin-grab's — no lead/meal/pause-limit columns
// exist for puchkaman).
export const organization = pgTable(
  "organization",
  {
    id: text("id").primaryKey().default(nextIdText),
    name: text("name").notNull(),
    slug: text("slug").unique(),
    logo: text("logo"),
    metadata: text("metadata"),
    clientCode: text("client_code").notNull(),
    // null = brand-level org (one per app, seeded once). Non-null = franchise/shop,
    // points at its brand.
    parentOrganizationId: text("parent_organization_id").references((): AnyPgColumn => organization.id),
    region: text("region"),
    timezone: text("timezone"),
    currency: text("currency"),
    integrationsConfig: jsonb("integrations_config").$type<IntegrationsConfig>(),
    storeLat: numeric("store_lat", { precision: 9, scale: 6 }),
    storeLng: numeric("store_lng", { precision: 9, scale: 6 }),
    // Fallback target when a request's acting-org resolution finds nothing more
    // specific. At most one org should carry this in normal operation.
    isDefaultLocation: boolean("is_default_location").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("organization_client_code_unique").on(t.clientCode),
    index("organization_parent_idx").on(t.parentOrganizationId),
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
  },
  (t) => [index("invitation_org_idx").on(t.organizationId), index("invitation_email_idx").on(t.email)],
);
