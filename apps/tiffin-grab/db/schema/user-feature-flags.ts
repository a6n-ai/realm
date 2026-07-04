import { updatableColumns } from "@tiffin/commons-drizzle";
import { bigint, boolean, pgTable, unique } from "drizzle-orm/pg-core";
import { featureFlags } from "./feature-flags";
import { users } from "./auth";

export const userFeatureFlags = pgTable(
  "user_feature_flags",
  {
    ...updatableColumns("uff"),
    userId: bigint("user_id", { mode: "bigint" }).notNull().references(() => users.id, { onDelete: "cascade" }),
    flagId: bigint("flag_id", { mode: "bigint" }).notNull().references(() => featureFlags.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull(),
  },
  (t) => [unique("user_feature_flags_user_flag_uq").on(t.userId, t.flagId)],
);
