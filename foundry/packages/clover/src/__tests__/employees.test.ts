import { describe, expect, it } from "vitest";
import { normalizeCloverEmployee } from "../employees";

describe("normalizeCloverEmployee", () => {
  it("maps core fields", () => {
    expect(
      normalizeCloverEmployee({
        id: "EMP1",
        name: "Alex Chen",
        nickname: "Al",
        email: "alex@example.com",
        customId: "A1",
        role: "MANAGER",
        isOwner: false,
        modifiedTime: 1_700_000_000_000,
      }),
    ).toMatchObject({
      id: "EMP1",
      name: "Alex Chen",
      nickname: "Al",
      email: "alex@example.com",
      customId: "A1",
      role: "MANAGER",
      isOwner: false,
      modifiedTime: 1_700_000_000_000,
    });
  });

  it("falls back to firstName + lastName", () => {
    expect(
      normalizeCloverEmployee({
        id: "EMP2",
        firstName: "Sam",
        lastName: "Lee",
      }),
    ).toMatchObject({ id: "EMP2", name: "Sam Lee" });
  });

  it("treats deletedTime as soft-delete marker", () => {
    const emp = normalizeCloverEmployee({
      id: "EMP3",
      name: "Gone",
      deletedTime: 1_700_000_000_000,
    });
    expect(emp.deletedTime).toBe(1_700_000_000_000);
  });

  it("rejects missing id/name", () => {
    expect(() => normalizeCloverEmployee({ name: "x" })).toThrow(/missing id/);
    expect(() => normalizeCloverEmployee({ id: "1" })).toThrow(/missing id or name/);
  });
});
