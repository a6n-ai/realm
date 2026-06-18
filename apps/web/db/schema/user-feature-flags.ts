import { updatableColumns } from "@tiffin/commons-drizzle";
import { boolean, pgTable, unique, uuid } from "drizzle-orm/pg-core";
import { featureFlags } from "./feature-flags";
import { users } from "./auth";

export const userFeatureFlags = pgTable(
  "user_feature_flags",
  {
    ...updatableColumns,
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    flagId: uuid("flag_id").notNull().references(() => featureFlags.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull(),
  },
  (t) => [unique("user_feature_flags_user_flag_uq").on(t.userId, t.flagId)],
);
