import { updatableColumns } from "@foundry/database";
import { bigint, boolean, index, integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const SESSION_CATEGORIES = [
  "kids",
  "adults",
  "birthday",
  "school",
  "drop_in",
  "private",
  "other",
] as const;
export type SessionCategory = (typeof SESSION_CATEGORIES)[number];

export const ATTENDANCE_MODES = ["stay", "drop_off", "either"] as const;
export type AttendanceMode = (typeof ATTENDANCE_MODES)[number];

export const BOOKING_STATUSES = ["pending", "confirmed", "cancelled"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const sessionCategory = pgEnum("session_category", [...SESSION_CATEGORIES]);
export const sessionAttendance = pgEnum("session_attendance", [...ATTENDANCE_MODES]);
export const bookingStatus = pgEnum("booking_status", [...BOOKING_STATUSES]);

/** Bookable offering. Table is studio_sessions so it does not collide with Better Auth `session`. */
export const studioSessions = pgTable(
  "studio_sessions",
  {
    ...updatableColumns("stn"),
    title: text("title").notNull(),
    category: sessionCategory("category").notNull(),
    description: text("description"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    audience: text("audience"),
    capacity: integer("capacity").notNull(),
    priceDisplay: text("price_display"),
    location: text("location"),
    attendanceMode: sessionAttendance("attendance_mode").notNull().default("either"),
    published: boolean("published").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
  },
  (t) => [
    index("studio_sessions_starts_idx").on(t.startsAt),
    index("studio_sessions_published_starts_idx").on(t.published, t.startsAt),
  ],
);

export const bookings = pgTable(
  "bookings",
  {
    ...updatableColumns("bkg"),
    sessionId: bigint("session_id", { mode: "bigint" })
      .notNull()
      .references(() => studioSessions.id),
    userId: bigint("user_id", { mode: "bigint" })
      .notNull()
      .references(() => users.id),
    seats: integer("seats").notNull().default(1),
    status: bookingStatus("status").notNull().default("confirmed"),
  },
  (t) => [
    index("bookings_session_status_idx").on(t.sessionId, t.status),
    index("bookings_user_idx").on(t.userId),
  ],
);
