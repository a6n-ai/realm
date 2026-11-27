import { sql } from "drizzle-orm";
import { c, check, defineTable, index, unique } from "@foundry/database/factory";

const users = defineTable(
  "users",
  {
    id: c.id("usr"),
    name: c.string("name").notNull(),
    email: c.string("email").notNull(),
    emailVerified: c.bool("email_verified").notNull().default(false),
    image: c.text("image"),
    role: c.string("role").notNull().default("sales"),
    status: c.string("status").notNull().default("active"),
    passwordSet: c.bool("password_set").notNull().default(false),
    banned: c.bool("banned").default(false),
    banReason: c.text("ban_reason"),
    banExpires: c.timestamp("ban_expires"),
    createdAt: c.timestamp("created_at").notNull(),
    updatedAt: c.timestamp("updated_at").notNull(),
  },
  (t) => [unique("users_email_uq").on(t.email)],
);

const sessions = defineTable(
  "sessions",
  {
    id: c.id("ses"),
    userId: c.ref("user_id").notNull().references(() => users.columns.id, { onDelete: "cascade" }),
    token: c.string("token").notNull(),
    expiresAt: c.timestamp("expires_at").notNull(),
    ipAddress: c.string("ip_address"),
    userAgent: c.text("user_agent"),
    impersonatedBy: c.string("impersonated_by"),
    createdAt: c.timestamp("created_at").notNull(),
    updatedAt: c.timestamp("updated_at").notNull(),
  },
  (t) => [unique("sessions_token_uq").on(t.token), index("session_user_id_idx").on(t.userId)],
);

const accounts = defineTable(
  "accounts",
  {
    id: c.id("acc"),
    userId: c.ref("user_id").notNull().references(() => users.columns.id, { onDelete: "cascade" }),
    accountId: c.string("account_id").notNull(),
    providerId: c.string("provider_id").notNull(),
    accessToken: c.text("access_token"),
    refreshToken: c.text("refresh_token"),
    idToken: c.text("id_token"),
    scope: c.text("scope"),
    password: c.text("password"),
    accessTokenExpiresAt: c.timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: c.timestamp("refresh_token_expires_at"),
    createdAt: c.timestamp("created_at").notNull(),
    updatedAt: c.timestamp("updated_at").notNull(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

const verifications = defineTable(
  "verifications",
  {
    id: c.id("ver"),
    identifier: c.string("identifier").notNull(),
    value: c.text("value").notNull(),
    expiresAt: c.timestamp("expires_at").notNull(),
    createdAt: c.timestamp("created_at").notNull(),
    updatedAt: c.timestamp("updated_at").notNull(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

const rateLimits = defineTable(
  "rate_limits",
  {
    id: c.id("rlm"),
    key: c.string("key").notNull(),
    count: c.int("count").notNull(),
    lastRequest: c.time("last_request").notNull(),
  },
  (t) => [unique("rate_limits_key_uq").on(t.key)],
);

const invites = defineTable(
  "invites",
  {
    ...c.base("inv"),
    userId: c.ref("user_id").notNull().references(() => users.columns.id, { onDelete: "cascade" }),
    invitedBy: c.ref("invited_by").notNull().references(() => users.columns.id),
    n: c.int("n").notNull(),
    idempotencyKey: c.string("idempotency_key").notNull(),
    relayMessageId: c.string("relay_message_id"),
    sentAt: c.time("sent_at"),
  },
  (t) => [
    unique("invites_idempotency_key_uq").on(t.idempotencyKey),
    unique("invites_user_n_uq").on(t.userId, t.n),
  ],
);

const companies = defineTable(
  "companies",
  {
    ...c.base("cmp"),
    name: c.string("name").notNull(),
    nameKey: c.string("name_key").notNull(),
  },
  (t) => [unique("companies_name_key_uq").on(t.nameKey)],
);

const leadSources = defineTable(
  "lead_sources",
  {
    ...c.base("lsr"),
    key: c.string("key").notNull(),
    label: c.string("label").notNull(),
    active: c.bool("active").notNull().default(true),
  },
  (t) => [unique("lead_sources_key_uq").on(t.key)],
);

const leadSubsources = defineTable(
  "lead_subsources",
  {
    ...c.base("lss"),
    sourceId: c.ref("source_id").notNull().references(() => leadSources.columns.id, { onDelete: "restrict" }),
    key: c.string("key").notNull(),
    label: c.string("label").notNull(),
    active: c.bool("active").notNull().default(true),
  },
  (t) => [unique("lead_subsources_source_key_uq").on(t.sourceId, t.key)],
);

const inquiries = defineTable(
  "inquiries",
  {
    ...c.base("inq"),
    contactName: c.string("contact_name"),
    phone: c.string("phone"),
    email: c.string("email"),
    companyId: c.ref("company_id").references(() => companies.columns.id),
    sourceId: c.ref("source_id").notNull().references(() => leadSources.columns.id),
    subSourceId: c.ref("sub_source_id").references(() => leadSubsources.columns.id),
    requirements: c.text("requirements"),
    stage: c.string("stage").notNull().default("new"),
    lostReason: c.string("lost_reason"),
    ownerId: c.ref("owner_id").references(() => users.columns.id),
    nextFollowUpAt: c.time("next_follow_up_at"),
    closedAt: c.time("closed_at"),
    externalId: c.string("external_id"),
    createdVia: c.string("created_via").notNull().default("manual"),
  },
  (t) => [
    index("inquiries_owner_follow_up_idx").on(t.ownerId, t.nextFollowUpAt),
    index("inquiries_stage_created_idx").on(t.stage, t.createdAt),
    unique("inquiries_source_external_uq").on(t.sourceId, t.externalId).whereNotNull(t.externalId),
    check("inquiries_contact_ck", (x) => sql`${x.contactName} IS NOT NULL OR ${x.phone} IS NOT NULL`),
    check("inquiries_follow_up_ck", (x) => sql`${x.closedAt} IS NOT NULL OR ${x.nextFollowUpAt} IS NOT NULL`),
  ],
);

const inquiryActivities = defineTable(
  "inquiry_activities",
  {
    id: c.id("iac"),
    createdAt: c.time("created_at").notNull(),
    inquiryId: c.ref("inquiry_id").notNull().references(() => inquiries.columns.id, { onDelete: "cascade" }),
    type: c.string("type").notNull(),
    note: c.text("note"),
    fromStage: c.string("from_stage"),
    toStage: c.string("to_stage"),
    fromOwnerId: c.ref("from_owner_id").references(() => users.columns.id),
    toOwnerId: c.ref("to_owner_id").references(() => users.columns.id),
    actorId: c.ref("actor_id").references(() => users.columns.id),
  },
  (t) => [index("inquiry_activities_inquiry_created_idx").on(t.inquiryId, t.createdAt)],
);

const auditLog = defineTable("audit_log", {
  ...c.base("aud"),
  action: c.string("action").notNull(),
  actorId: c.ref("actor_id").notNull().references(() => users.columns.id),
  target: c.string("target"),
  data: c.json<Record<string, unknown>>("data"),
});

export const tables = {
  users,
  sessions,
  accounts,
  verifications,
  rateLimits,
  invites,
  companies,
  leadSources,
  leadSubsources,
  inquiries,
  inquiryActivities,
  auditLog,
};
