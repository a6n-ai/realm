import { describe, expect, it } from "vitest";
import { employees } from "@/db/schema";

/**
 * One employee maps to at most one auth account, and an employee without an
 * email has none at all — so the column must be nullable AND unique. Nullable
 * without unique would let one user row be claimed by two employees.
 */
describe("employees.user_id", () => {
  it("exists", () => {
    expect(employees.userId).toBeDefined();
  });

  it("is nullable — an employee with no email gets no account", () => {
    expect(employees.userId.notNull).toBe(false);
  });

  it("is unique — two employees cannot share one auth account", () => {
    expect(employees.userId.isUnique).toBe(true);
  });
});
