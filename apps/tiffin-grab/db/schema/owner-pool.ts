import { updatableColumns } from "@foundry/database";
import { bigint, integer, index, pgEnum, pgTable, text, unique } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { leadSources } from "./lead-sources";
import { organization } from "./organizations";

// Which record type a pool assigns owners for.
export const ownerEntity = pgEnum("owner_entity", ["inquiry", "order", "ticket"]);

// Staff pools that new inquiries, orders and tickets are assigned from (Settings → Owner
// assignment). One row = one staff member in one entity's pool, with a weight for the
// percentage strategy. `source_id` only applies to entity = 'inquiry' (per-lead-source pool;
// NULL = that entity's default pool). Orders and tickets only ever use source_id NULL.
export const ownerPool = pgTable("owner_pool", {
  ...updatableColumns("iuc"),
  entity: ownerEntity("entity").notNull().default("inquiry"),
  userId: bigint("user_id", { mode: "bigint" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  sourceId: bigint("source_id", { mode: "bigint" }).references(() => leadSources.id, { onDelete: "cascade" }),
  weight: integer("weight").notNull().default(1),
  // Client-scoping — see orders.organizationId for the pattern. Nullable during backfill.
  organizationId: text("organization_id").references(() => organization.id),
}, (t) => [
  unique("owner_pool_entity_user_source_unique").on(t.entity, t.userId, t.sourceId),
  index("owner_pool_source_idx").on(t.sourceId),
  index("owner_pool_organization_idx").on(t.organizationId),
]);
