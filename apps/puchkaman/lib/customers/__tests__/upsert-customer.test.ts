import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { customerUpdateSet } from "../upsert-customer";

/**
 * A guest checkout may fill in blanks on a record that was never claimed. It may
 * not write to an account someone actually signed into — otherwise ordering with
 * a stranger's email rewrites their profile.
 *
 * `customerUpdateSet[column]` is a drizzle `sql` template holding query chunks
 * and column refs (a `PgTable` back-reference makes it circular), not a plain
 * value — JSON.stringify can't render it. Compile it to the real SQL string via
 * the pg dialect instead, so the assertion proves the guard columns are actually
 * in the emitted statement.
 */
const dialect = new PgDialect();
const sql = (v: unknown) => dialect.sqlToQuery(v as Parameters<PgDialect["sqlToQuery"]>[0]).sql;

describe("customerUpdateSet", () => {
  it("guards both writable columns on the row not being a claimed account", () => {
    for (const column of ["name", "phone"] as const) {
      const clause = sql(customerUpdateSet[column]);
      expect(clause).toContain("password_set");
      expect(clause).toContain("email_verified");
    }
  });

  it("never writes role or status", () => {
    expect(customerUpdateSet).not.toHaveProperty("role");
    expect(customerUpdateSet).not.toHaveProperty("status");
  });
});
