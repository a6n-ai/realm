import { makePublicId, updatableColumns } from "@realm/database";
import { sql } from "drizzle-orm";
import { bigint, boolean, index, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const nextIdText = sql`(next_id())::text`;

// Single-role app: only "admin" logs in today. Kept as an enum (not just
// "admin") so a future member/customer role doesn't need a schema migration.
export const userRole = pgEnum("user_role", ["admin", "member", "user"]);

export const users = pgTable(
  "users",
  {
    ...updatableColumns("usr"),
    name: text("name"),
    email: text("email"),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: userRole("role").notNull().default("user"),
    // false = account still on an issued default/temp password and must set its
    // own on first login. The dashboard gate redirects to /set-password while
    // this is false; setOwnPassword flips it true.
    passwordSet: boolean("password_set").notNull().default(false),
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
