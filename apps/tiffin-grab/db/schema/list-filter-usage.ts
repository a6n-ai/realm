import { baseColumns } from "@foundry/database";
import { bigint, index, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { organization } from "./organizations";

// Which facet filters each staff member applies on each admin list, so the list
// can recommend them back: the user's own first, else what their organization uses.
// `params` is a canonical query string of facet params only; the viewer's own
// owner id is stored as "me" so "my orders" pools across staff.
export const listFilterUsage = pgTable("list_filter_usage", {
  ...baseColumns("lfu"),
  userId: bigint("user_id", { mode: "bigint" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  params: text("params").notNull(),
  uses: integer("uses").notNull().default(1),
  lastUsedAt: bigint("last_used_at", { mode: "number" }).notNull(),
}, (t) => [
  uniqueIndex("list_filter_usage_user_path_params_idx").on(t.userId, t.path, t.params),
  index("list_filter_usage_org_path_idx").on(t.organizationId, t.path),
]);
