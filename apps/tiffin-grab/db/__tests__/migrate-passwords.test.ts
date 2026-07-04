import { describe, expect, it } from "vitest";
import { toAccountRows } from "@/db/migrate-passwords";

describe("toAccountRows", () => {
  it("maps credentialed users to credential account rows", () => {
    const rows = toAccountRows([
      { id: 10n, passwordHash: "$2a$10$abc" },
      { id: 11n, passwordHash: null },
    ]);
    expect(rows).toEqual([
      { accountId: "10", providerId: "credential", userId: 10n, password: "$2a$10$abc" },
    ]);
  });
});
