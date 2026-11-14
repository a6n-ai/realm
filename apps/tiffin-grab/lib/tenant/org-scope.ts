import { inArray, sql, type Column, type SQL } from "drizzle-orm";

export type Visible = "all" | string[];

// "all" is unscoped; an empty list matches nothing (fail closed), never an unscoped query.
export const orgScope = (column: Column, visible: Visible): SQL | undefined =>
  visible === "all" ? undefined : visible.length ? inArray(column, visible) : sql`false`;
