import { describe, expect, it } from "vitest";
import { resolveMigrationUrl } from "./resolve-migration-url";

describe("resolveMigrationUrl", () => {
  it("prefers DIRECT_DATABASE_URL (migrations bypass the pooler)", () => {
    expect(
      resolveMigrationUrl({ DIRECT_DATABASE_URL: "postgres://direct", DATABASE_URL: "postgres://pooler" }),
    ).toBe("postgres://direct");
  });

  it("falls back to DATABASE_URL when DIRECT is unset", () => {
    expect(resolveMigrationUrl({ DATABASE_URL: "postgres://pooler" })).toBe("postgres://pooler");
  });

  it("throws when neither is set", () => {
    expect(() => resolveMigrationUrl({})).toThrow(/DATABASE_URL/);
  });
});
