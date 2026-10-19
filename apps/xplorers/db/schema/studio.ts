import { updatableColumns } from "@foundry/database";
import { sql } from "drizzle-orm";
import { bigint, boolean, date, index, integer, jsonb, pgEnum, pgTable, smallint, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { children } from "./children";
import type { ClassPricing, PriceTable } from "@/lib/pricing/types";
import type { RepeatPattern } from "@/lib/sessions/pattern";
import type { BookingPricing } from "./discounts";

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

export const CLASS_BOOKING_TYPES = ["bookable", "enquire_only"] as const;
export type ClassBookingType = (typeof CLASS_BOOKING_TYPES)[number];

export const OCCURRENCE_STATUSES = ["scheduled", "cancelled"] as const;
export type OccurrenceStatus = (typeof OCCURRENCE_STATUSES)[number];

export const classBookingType = pgEnum("class_booking_type", [...CLASS_BOOKING_TYPES]);
export const occurrenceStatus = pgEnum("occurrence_status", [...OCCURRENCE_STATUSES]);
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
    capacity: integer("capacity").notNull(),
    location: text("location"),
    attendanceMode: sessionAttendance("attendance_mode").notNull().default("either"),
    published: boolean("published").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
    photos: text("photos").array().notNull().default(sql`'{}'::text[]`),
    summary: text("summary").notNull().default(""),
    included: text("included"),
    scheduleLine: text("schedule_line"),
    groupSize: text("group_size"),
    ageMin: smallint("age_min"),
    ageMax: smallint("age_max"),
    ageWaiver: boolean("age_waiver").notNull().default(false),
    bookingType: classBookingType("booking_type").notNull().default("bookable"),
    color: text("color").notNull().default("pink"),
    pricing: jsonb("pricing").$type<ClassPricing>().notNull(),
    prices: jsonb("prices").$type<PriceTable>(),
    pattern: jsonb("pattern").$type<RepeatPattern>(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("studio_sessions_published_sort_idx").on(t.published, t.sortOrder)],
);

/** One dated session of a class. Times and capacity are copied from the class pattern and may be edited per day. */
export const studioSessionOccurrences = pgTable(
  "studio_session_occurrences",
  {
    ...updatableColumns("occ"),
    sessionId: bigint("session_id", { mode: "bigint" })
      .notNull()
      .references(() => studioSessions.id),
    occursOn: date("occurs_on", { mode: "string" }).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    capacity: integer("capacity").notNull(),
    prices: jsonb("prices").$type<PriceTable>(),
    status: occurrenceStatus("status").notNull().default("scheduled"),
    edited: boolean("edited").notNull().default(false),
  },
  (t) => [
    uniqueIndex("studio_session_occurrences_session_day_idx").on(t.sessionId, t.occursOn),
    index("studio_session_occurrences_starts_idx").on(t.startsAt),
  ],
);

export const bookings = pgTable(
  "bookings",
  {
    ...updatableColumns("bkg"),
    sessionId: bigint("session_id", { mode: "bigint" })
      .notNull()
      .references(() => studioSessions.id),
    occurrenceId: bigint("occurrence_id", { mode: "bigint" })
      .notNull()
      .references(() => studioSessionOccurrences.id),
    userId: bigint("user_id", { mode: "bigint" })
      .notNull()
      .references(() => users.id),
    /** Number of children. */
    seats: integer("seats").notNull().default(1),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    optionKey: text("option_key"),
    lengthMinutes: integer("length_minutes").notNull(),
    extensionSteps: integer("extension_steps").notNull().default(0),
    adults: integer("adults").notNull().default(0),
    status: bookingStatus("status").notNull().default("confirmed"),
    /** Price snapshot at booking time. Null for free classes and pre-discount rows. */
    pricing: jsonb("pricing").$type<BookingPricing>(),
  },
  (t) => [
    index("bookings_session_status_idx").on(t.sessionId, t.status),
    index("bookings_occurrence_status_idx").on(t.occurrenceId, t.status),
    index("bookings_user_idx").on(t.userId),
    uniqueIndex("bookings_occurrence_user_open_idx")
      .on(t.occurrenceId, t.userId)
      .where(sql`${t.status} IN ('confirmed', 'pending')`),
  ],
);

export const bookingChildren = pgTable(
  "booking_children",
  {
    ...updatableColumns("bkc"),
    bookingId: bigint("booking_id", { mode: "bigint" })
      .notNull()
      .references(() => bookings.id),
    childId: bigint("child_id", { mode: "bigint" })
      .notNull()
      .references(() => children.id),
    waiverUsed: boolean("waiver_used").notNull().default(false),
  },
  (t) => [uniqueIndex("booking_children_booking_child_idx").on(t.bookingId, t.childId)],
);
