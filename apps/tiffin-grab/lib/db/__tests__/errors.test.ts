import { describe, expect, it } from "vitest";
import { csvCell } from "@/lib/csv-cell";
import { isUniqueViolation } from "../errors";

describe("isUniqueViolation", () => {
  const wrapped = { cause: { cause: { code: "23505", constraint_name: "users_username_unique" } } };
  it("sees through drizzle's wrapping and filters by constraint", () => {
    expect(isUniqueViolation(wrapped)).toBe(true);
    expect(isUniqueViolation(wrapped, "username")).toBe(true);
    expect(isUniqueViolation(wrapped, /^other$/)).toBe(false);
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
  });
});

describe("csvCell", () => {
  it("guards formulas and quotes only when needed", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell(null)).toBe("");
  });
});
