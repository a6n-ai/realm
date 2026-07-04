import { updatableColumns } from "@realm/commons-drizzle";
import { bigint, integer, index, pgTable, unique } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { leadSources } from "./lead-sources";

export const inquiryUserConfig = pgTable("inquiry_user_config", {
  ...updatableColumns("iuc"),
  userId: bigint("user_id", { mode: "bigint" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  // NULL sourceId = the source-agnostic default pool.
  sourceId: bigint("source_id", { mode: "bigint" }).references(() => leadSources.id, { onDelete: "cascade" }),
  weight: integer("weight").notNull().default(1),
}, (t) => [
  unique("inquiry_user_config_user_source_unq").on(t.userId, t.sourceId),
  index("inquiry_user_config_source_idx").on(t.sourceId),
]);
