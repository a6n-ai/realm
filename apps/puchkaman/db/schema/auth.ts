import { makePublicId, updatableColumns } from "@realm/database";
import { sql } from "drizzle-orm";
import { bigint, boolean, index, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const nextIdText = sql`(next_id())::text`;

// "admin" and "member" are staff roles (order:write, finance:read, etc). "user" is
// the customer role — a row provisioned by checkout with NO credential row, so it
// signs in later only via email OTP, never a password. The default is "user" so a
// row that somehow arrives without an explicit role fails closed onto the powerless
// role rather than a staff one.
export const userRole = pgEnum("user_role", ["admin", "member", "user"]);

// Template locale. `en` only today; the column exists so notification_template's
// (event, channel, locale) key has a real domain and adding a language later is
// a migration rather than a redesign.
export const locale = pgEnum("locale", ["en", "fr"]);

// Account lifecycle. Only "active" may obtain a session — enforced in
// lib/auth/index.ts's session.create.before hook and re-checked on the read path.
// "deleted" is a soft delete: the row and its business references survive, the
// contact details are tombstoned. Matches tiffin-grab.
export const userStatus = pgEnum("user_status", ["active", "inactive", "suspended", "deleted"]);

export const users = pgTable(
  "users",
  {
    ...updatableColumns("usr"),
    name: text("name"),
    email: text("email"),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    locale: locale("locale").notNull().default("en"),
    // Customers arrive by guest checkout, so the phone is the order's phone
    // until someone verifies it. Unverified numbers must never receive SMS.
    phone: text("phone"),
    phoneVerified: boolean("phone_verified").notNull().default(false),
    // Fails closed: `member` holds order:write and finance:read, so a row created
    // without an explicit role must never land on it. Invites and checkout both
    // pass `role` themselves.
    role: userRole("role").notNull().default("user"),
    // Org-independent platform bypass for cross-client visibility. See
    // resolveVisibleOrgIds in @realm/auth.
    platformRole: text("platform_role"),
    status: userStatus("status").notNull().default("active"),
    // false = account still on an issued default/temp password and must set its
    // own on first login. The dashboard gate redirects to /set-password while
    // this is false; setOwnPassword flips it true.
    passwordSet: boolean("password_set").notNull().default(false),
    // Declared by the better-auth admin plugin and never written by this app —
    // users.status is the only sign-in switch (see the session.create.before hook).
    // Present so the drizzle adapter can resolve every field the plugin declares.
    banned: boolean("banned").default(false),
    banReason: text("ban_reason"),
    banExpires: timestamp("ban_expires"),
    bauthCreatedAt: timestamp("bauth_created_at").notNull().defaultNow(),
    bauthUpdatedAt: timestamp("bauth_updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(t.email).where(sql`${t.email} is not null`),
    index("users_created_idx").on(t.createdAt),
  ],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey().default(nextIdText),
    publicId: text("public_id").notNull().unique().$defaultFn(makePublicId("ses")),
    appId: bigint("app_id", { mode: "bigint" }).notNull().default(sql`current_app_id()`),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    // Declared by the admin plugin's schema; impersonation is not enabled here.
    impersonatedBy: text("impersonated_by"),
    userId: bigint("user_id", { mode: "bigint" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable("account", {
  id: text("id").primaryKey().default(nextIdText),
  publicId: text("public_id").notNull().unique().$defaultFn(makePublicId("act")),
  appId: bigint("app_id", { mode: "bigint" }).notNull().default(sql`current_app_id()`),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: bigint("user_id", { mode: "bigint" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey().default(nextIdText),
  publicId: text("public_id").notNull().unique().$defaultFn(makePublicId("ver")),
  appId: bigint("app_id", { mode: "bigint" }).notNull().default(sql`current_app_id()`),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
