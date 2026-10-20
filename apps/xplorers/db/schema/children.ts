import { updatableColumns } from "@foundry/database";
import { bigint, date, index, pgTable, text } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const children = pgTable(
  "children",
  {
    ...updatableColumns("chd"),
    userId: bigint("user_id", { mode: "bigint" })
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    dateOfBirth: date("date_of_birth", { mode: "string" }).notNull(),
  },
  (t) => [index("children_user_idx").on(t.userId)],
);
