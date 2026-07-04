import { baseColumns } from "@tiffin/commons-drizzle";
import { jsonb, pgEnum, pgTable, text } from "drizzle-orm/pg-core";

export const auditOperation = pgEnum("audit_operation", [
  "create", "update", "delete", "read", "login", "logout", "login_failed",
]);

export const auditLog = pgTable("audit_log", {
  ...baseColumns("aud"),
  entity: text("entity").notNull(),
  entityPublicId: text("entity_public_id").notNull(),
  operation: auditOperation("operation").notNull(),
  changes: jsonb("changes"),
});
