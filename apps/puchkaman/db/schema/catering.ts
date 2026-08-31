import { baseColumns } from "@foundry/database";
import { index, pgTable, text } from "drizzle-orm/pg-core";

// One row per "Request a Catering Quote" submission (app/(marketing)/catering).
// Mirrors cateringInquirySchema (lib/catering/schema.ts) — the route still
// emails NOTIFY_TO on top of this, this is just the record staff can browse.
export const cateringInquiries = pgTable(
  "catering_inquiries",
  {
    ...baseColumns("cat"),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email").notNull(),
    eventDate: text("event_date").notNull(),
    location: text("location").notNull(),
    guests: text("guests").notNull(),
    eventType: text("event_type").notNull(),
    allergies: text("allergies"),
    message: text("message"),
  },
  (t) => [index("catering_inquiries_created_idx").on(t.createdAt)],
);
