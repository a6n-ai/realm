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
    lastSignInAt: c.timestamp("last_sign_in_at"),
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
    activeOrganizationId: c.string("active_organization_id"),
    activeTeamId: c.string("active_team_id"),
    createdAt: c.timestamp("created_at").notNull(),
    updatedAt: c.timestamp("updated_at").notNull(),
  },
  (t) => [unique("sessions_token_uq").on(t.token), index("session_user_id_idx").on(t.userId)],
);

// Better Auth organization plugin (teams + dynamic access control). a6n is the first organisation; business rows below
// carry organization_id. It stays nullable in D1: making it NOT NULL needs a table rebuild, and D1 keeps foreign keys on,
// so dropping a parent table would cascade-delete its children. Every service writes it; the isolation suite proves it.
const organizations = defineTable(
  "organizations",
  {
    id: c.id("org"),
    name: c.string("name").notNull(),
    slug: c.string("slug").notNull(),
    logo: c.text("logo"),
    metadata: c.text("metadata"),
    createdAt: c.timestamp("created_at").notNull(),
  },
  (t) => [unique("organizations_slug_uq").on(t.slug)],
);

const orgRef = () => c.ref("organization_id").references(() => organizations.columns.id);

const members = defineTable(
  "members",
  {
    id: c.id("mem"),
    organizationId: orgRef().notNull(),
    userId: c.ref("user_id").notNull().references(() => users.columns.id, { onDelete: "cascade" }),
    role: c.string("role").notNull().default("member"),
    createdAt: c.timestamp("created_at").notNull(),
  },
  (t) => [unique("members_org_user_uq").on(t.organizationId, t.userId), index("members_user_idx").on(t.userId)],
);

// Better Auth's invitation model. a6n sends its own invites (invites table), so this stays empty but must exist.
const invitations = defineTable(
  "invitations",
  {
    id: c.id("ivt"),
    organizationId: orgRef().notNull(),
    email: c.string("email").notNull(),
    role: c.string("role"),
    teamId: c.string("team_id"),
    status: c.string("status").notNull().default("pending"),
    expiresAt: c.timestamp("expires_at").notNull(),
    inviterId: c.ref("inviter_id").notNull().references(() => users.columns.id),
    createdAt: c.timestamp("created_at").notNull(),
  },
  (t) => [index("invitations_org_idx").on(t.organizationId)],
);

const teams = defineTable(
  "teams",
  {
    id: c.id("tea"),
    name: c.string("name").notNull(),
    organizationId: orgRef().notNull(),
    memberCount: c.int("member_count").notNull().default(0),
    createdAt: c.timestamp("created_at").notNull(),
    updatedAt: c.timestamp("updated_at"),
  },
  (t) => [index("teams_org_idx").on(t.organizationId)],
);

const teamMembers = defineTable(
  "team_members",
  {
    id: c.id("tmm"),
    teamId: c.ref("team_id").notNull().references(() => teams.columns.id, { onDelete: "cascade" }),
    userId: c.ref("user_id").notNull().references(() => users.columns.id, { onDelete: "cascade" }),
    membershipKey: c.string("membership_key"),
    createdAt: c.timestamp("created_at"),
  },
  (t) => [unique("team_members_team_user_uq").on(t.teamId, t.userId), unique("team_members_membership_key_uq").on(t.membershipKey)],
);

const organizationRoles = defineTable(
  "organization_roles",
  {
    id: c.id("orl"),
    organizationId: orgRef().notNull(),
    role: c.string("role").notNull(),
    permission: c.text("permission").notNull(),
    createdAt: c.timestamp("created_at").notNull(),
    updatedAt: c.timestamp("updated_at"),
  },
  (t) => [unique("organization_roles_org_role_uq").on(t.organizationId, t.role)],
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
    organizationId: orgRef(),
    userId: c.ref("user_id").notNull().references(() => users.columns.id, { onDelete: "cascade" }),
    invitedBy: c.ref("invited_by").notNull().references(() => users.columns.id),
    n: c.int("n").notNull(),
    idempotencyKey: c.string("idempotency_key").notNull(),
    relayMessageId: c.string("relay_message_id"),
    sentAt: c.time("sent_at"),
  },
  (t) => [
    unique("invites_idempotency_key_uq").on(t.idempotencyKey),
    unique("invites_user_org_n_uq").on(t.userId, t.organizationId, t.n),
  ],
);

const companies = defineTable(
  "companies",
  {
    ...c.base("cmp"),
    organizationId: orgRef(),
    name: c.string("name").notNull(),
    nameKey: c.string("name_key").notNull(),
  },
  (t) => [unique("companies_org_name_key_uq").on(t.organizationId, t.nameKey)],
);

const leadSources = defineTable(
  "lead_sources",
  {
    ...c.base("lsr"),
    organizationId: orgRef(),
    key: c.string("key").notNull(),
    label: c.string("label").notNull(),
    active: c.bool("active").notNull().default(true),
  },
  (t) => [unique("lead_sources_org_key_uq").on(t.organizationId, t.key)],
);

const leadSubsources = defineTable(
  "lead_subsources",
  {
    ...c.base("lss"),
    organizationId: orgRef(),
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
    organizationId: orgRef(),
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
    organizationId: orgRef(),
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
  organizationId: orgRef(),
  action: c.string("action").notNull(),
  actorId: c.ref("actor_id").notNull().references(() => users.columns.id),
  target: c.string("target"),
  data: c.json<Record<string, unknown>>("data"),
});

export const tables = {
  users,
  organizations,
  members,
  invitations,
  teams,
  teamMembers,
  organizationRoles,
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
