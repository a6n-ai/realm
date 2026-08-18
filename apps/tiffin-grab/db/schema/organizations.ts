import { sql } from "drizzle-orm";
import { type AnyPgColumn, bigint, boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { IntegrationsConfig } from "@realm/clover";
import type { PaymentConfig } from "@realm/payments";
import type { DiscountPolicy } from "./coupons";
import { users } from "./auth";

const nextIdText = sql`(next_id())::text`;

export const invitationStatus = pgEnum("invitation_status", ["pending", "accepted", "rejected", "canceled"]);

// Better Auth `organization` plugin table, extended with the client-hierarchy fields
// this app needs (docs/superpowers/specs/2026-08-18-client-org-hierarchy-design.md).
// clientCode is a business identifier (used in URLs/pricing lookups) — distinct from
// `slug`, which stays an auth-routing concern.
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
    // points at its brand. Depth beyond 2 levels is rejected in the
    // organization.create hook (apps/tiffin-grab/lib/auth/index.ts), not here — see
    // packages/auth/src/organization.ts assertHierarchyDepth.
    parentOrganizationId: text("parent_organization_id").references((): AnyPgColumn => organization.id),
    region: text("region"),
    // App-settings columns, migrated from `app` (docs/superpowers/specs/2026-08-19-tenant-url-routing-design.md).
    // Nullable here: a brand org gets these populated by db/seed-brand-org.ts's backfill;
    // a franchise/shop org left null means "not yet supported" — override/inheritance logic
    // is explicitly future work, not built by this migration. `app` itself is untouched.
    timezone: text("timezone"),
    cutoffHour: integer("cutoff_hour"),
    defaultMaxPauses: integer("default_max_pauses"),
    defaultMaxPauseDaysTotal: integer("default_max_pause_days_total"),
    defaultMaxPauseStretchDays: integer("default_max_pause_stretch_days"),
    currency: text("currency"),
    defaultCountry: text("default_country"),
    leadAssignment: jsonb("lead_assignment"),
    mealTypes: jsonb("meal_types"),
    discountPolicy: jsonb("discount_policy").$type<DiscountPolicy>(),
    paymentConfig: jsonb("payment_config").$type<PaymentConfig>(),
    integrationsConfig: jsonb("integrations_config").$type<IntegrationsConfig>(),
    maxWalletBalance: integer("max_wallet_balance"),
    // Fallback target when a request's URL segment matches no organization.clientCode
    // (root domain hit directly, or an unrecognized segment). At most one org should
    // carry this in normal operation — proxy.ts's resolver picks the first if several do.
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
