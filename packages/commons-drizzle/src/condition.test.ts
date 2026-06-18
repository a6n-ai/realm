import { and, between, eq, inList, ValidationError } from "@tiffin/commons";
import { integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { resolveColumn, toDrizzleWhere } from "./condition";

const demo = pgTable("demo", {
  id: uuid("id").primaryKey(),
  status: text("status"),
  kcal: integer("kcal"),
});

describe("toDrizzleWhere", () => {
  it("returns undefined for no condition", () => {
    expect(toDrizzleWhere(demo, undefined)).toBeUndefined();
  });
  it("translates an eq filter to SQL", () => {
    const where = toDrizzleWhere(demo, eq("status", "active"));
    expect(where).toBeDefined();
  });
  it("translates in/between/complex without throwing", () => {
    const where = toDrizzleWhere(demo, and(inList("status", ["a", "b"]), between("kcal", 500, 900)));
    expect(where).toBeDefined();
  });
  it("throws ValidationError on an unknown field", () => {
    expect(() => toDrizzleWhere(demo, eq("nope", 1))).toThrow(ValidationError);
  });
});

describe("resolveColumn", () => {
  it("returns the column for a known field", () => {
    expect(resolveColumn(demo, "status")).toBeDefined();
  });
  it("throws ValidationError (400) for an unknown field", () => {
    try {
      resolveColumn(demo, "nope");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).status).toBe(400);
    }
  });
});
