import { makePublicId, updatableColumns } from "@realm/database";
import { sql } from "drizzle-orm";
import { bigint, boolean, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// better-auth (generateId:false) reads these ids as opaque strings and never
// sets them — the DB default fills them. Keep the column text but derive from
// next_id() so every table shares one id scheme instead of stray uuids.
const nextIdText = sql`(next_id())::text`;

export const userRole = pgEnum("user_role", ["admin", "member", "user"]);

/**
 * Account lifecycle. Only `active` may sign in. `inactive` = admin-deactivated
 * (reversible); `suspended` = admin-blocked for policy; `deleted` = soft-deleted
 * (hidden from lists, contact anonymized so the email/phone can be reused). We
 * never hard-delete — user rows are referenced across orders/wallet/tickets.
 */
export const userStatus = pgEnum("user_status", ["active", "inactive", "suspended", "deleted"]);

/** Supported notification locales. Recipient locale → en fallback at render. */
export const locale = pgEnum("locale", ["en", "fr"]);

export const users = pgTable(
  "users",
  {
    ...updatableColumns("usr"),
    name: text("name"),
    email: text("email"),
    emailVerified: boolean("email_verified").notNull().default(false),
    phoneVerified: boolean("phone_verified").notNull().default(false),
    image: text("image"),
    phone: text("phone"),
    role: userRole("role").notNull().default("user"),
    status: userStatus("status").notNull().default("active"),
    pinHash: text("pin_hash"),
    pinAttempts: integer("pin_attempts").notNull().default(0),
    // false = account still on an issued default/temp password and must set its
    // own on first login. Defaults true so existing rows are untouched; only the
    // paths that issue a default password flip it false.
    passwordSet: boolean("password_set").notNull().default(true),
    // better-auth username plugin: `username` is the normalized (lowercased) unique
    // handle; `displayUsername` preserves the original casing.
    username: text("username").unique(),
    displayUsername: text("display_username"),
    // better-auth anonymous plugin: guest sessions with no PII, linkable later.
    isAnonymous: boolean("is_anonymous").notNull().default(false),
    isSystem: boolean("is_system").notNull().default(false),
    addressLine: text("address_line"),
    addressUnit: text("address_unit"),
    city: text("city"),
    postalCode: text("postal_code"),
    province: text("province"),
    dietaryNotes: text("dietary_notes"),
    allergens: text("allergens"),
    deliveryNotes: text("delivery_notes"),
    notifyEmail: boolean("notify_email").notNull().default(true),
    notifySms: boolean("notify_sms").notNull().default(false),
    locale: locale("locale").notNull().default("en"),
    bauthCreatedAt: timestamp("bauth_created_at").notNull().defaultNow(),
    bauthUpdatedAt: timestamp("bauth_updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(t.email).where(sql`${t.email} is not null`),
    uniqueIndex("users_phone_unique").on(t.phone).where(sql`${t.phone} is not null`),
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
    userId: bigint("user_id", { mode: "bigint" }).notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey().default(nextIdText),
    publicId: text("public_id").notNull().unique().$defaultFn(makePublicId("act")),
    appId: bigint("app_id", { mode: "bigint" }).notNull().default(sql`current_app_id()`),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: bigint("user_id", { mode: "bigint" }).notNull().references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey().default(nextIdText),
    publicId: text("public_id").notNull().unique().$defaultFn(makePublicId("ver")),
    appId: bigint("app_id", { mode: "bigint" }).notNull().default(sql`current_app_id()`),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);
