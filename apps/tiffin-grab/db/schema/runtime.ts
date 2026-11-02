import { sql } from "drizzle-orm";
import { bigint, integer, pgTable, text } from "drizzle-orm/pg-core";

// State that lived in Redis or process memory on EC2. Workers isolates share
// neither, so it moves to Postgres.

const nextIdText = sql`(next_id())::text`;

/** Short leases (pay lock, OptimoRoute poll lock) plus small values (OptimoRoute cursor). */
export const runtimeLeases = pgTable("runtime_leases", {
  key: text("key").primaryKey(),
  holder: text("holder"),
  expiresAt: bigint("expires_at", { mode: "number" }),
  value: text("value"),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

/** Hourly OTP send caps per recipient / IP. */
export const otpThrottle = pgTable("otp_throttle", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStart: bigint("window_start", { mode: "number" }).notNull(),
});

/** Better Auth `rateLimit` model (storage: "database"). Shape fixed by better-auth core. */
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey().default(nextIdText),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
