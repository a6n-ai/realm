import { updatableColumns } from "@realm/database";
import { bigint, boolean, pgTable, text } from "drizzle-orm/pg-core";

import { users } from "./auth";

/**
 * Clover merchant employees (Register staff).
 * Pull-synced from Platform `/v3/merchants/{mId}/employees`.
 * Used to assign ownership of Platform orders (`orders.assigned_employee_id`).
 */
export const employees = pgTable("employees", {
  ...updatableColumns("emp"),
  name: text("name").notNull(),
  nickname: text("nickname"),
  email: text("email"),
  /** Merchant-defined custom id from Clover. */
  customId: text("custom_id"),
  /** OWNER | ADMIN | MANAGER | EMPLOYEE (Clover role string). */
  role: text("role"),
  isOwner: boolean("is_owner").notNull().default(false),
  active: boolean("active").notNull().default(true),
  cloverEmployeeId: text("clover_employee_id").unique(),
  cloverLastSyncedAt: bigint("clover_last_synced_at", { mode: "number" }),
  // A Clover employee maps to at most one auth account. Nullable because an
  // employee with no email has no key to create a user row from; unique so one
  // account cannot be claimed by two employees.
  userId: bigint("user_id", { mode: "bigint" }).references(() => users.id).unique(),
});
