import { updatableColumns } from "@foundry/database";
import { bigint, date, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { organization } from "./organizations";

// One row per closed day per organization. Deliveries on that date are paused and tagged
// (deliveries.holiday_id) and an ordinary delivery per eating day is added at plan end
// (lib/services/holiday-apply.ts). A past-dated row may exist for display only.
export const holidays = pgTable("holidays", {
  ...updatableColumns("hol"),
  organizationId: text("organization_id").notNull().references(() => organization.id),
  date: date("date").notNull(),
  name: text("name").notNull(),
  notifiedAt: bigint("notified_at", { mode: "number" }),
}, (t) => [
  uniqueIndex("holidays_organization_date_unique").on(t.organizationId, t.date),
  index("holidays_date_idx").on(t.date),
]);
