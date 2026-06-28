import { describe, it, expect } from "vitest";
import { diffChanges } from "../session-service";
import { redactUserChanges } from "../users.service";

describe("diffChanges", () => {
  it("returns {from,to} for changed patched fields only", () => {
    const before = { name: "old", price: 10, createdAt: 1 };
    const after = { name: "new", price: 10, createdAt: 1 };
    expect(diffChanges(before, after, { name: "new", price: 10 })).toEqual({
      name: { from: "old", to: "new" },
    });
  });

  it("ignores managed fields", () => {
    const before = { name: "a", updatedBy: 1n, updatedAt: 1 };
    const after = { name: "a", updatedBy: 2n, updatedAt: 2 };
    expect(diffChanges(before, after, { name: "a", updatedBy: 2n })).toBeNull();
  });

  it("returns null when nothing changed", () => {
    expect(diffChanges({ name: "a" }, { name: "a" }, { name: "a" })).toBeNull();
  });
});

describe("redactUserChanges", () => {
  it("redacts pinHash from/to as [redacted]", () => {
    const result = redactUserChanges({
      pinHash: { from: "bcrypt_old", to: "bcrypt_new" },
      name: { from: "Alice", to: "Bob" },
    });
    expect(result).toEqual({
      pinHash: { from: "[redacted]", to: "[redacted]" },
      name: { from: "Alice", to: "Bob" },
    });
  });

  it("drops pinAttempts from diff", () => {
    const result = redactUserChanges({
      pinAttempts: { from: 0, to: 3 },
      name: { from: "Alice", to: "Bob" },
    });
    expect(result).toEqual({
      name: { from: "Alice", to: "Bob" },
    });
  });

  it("returns null when only redacted fields remain", () => {
    const result = redactUserChanges({
      pinAttempts: { from: 0, to: 1 },
    });
    expect(result).toBeNull();
  });

  it("passes other fields through unchanged", () => {
    const result = redactUserChanges({
      email: { from: "a@b.com", to: "c@d.com" },
    });
    expect(result).toEqual({ email: { from: "a@b.com", to: "c@d.com" } });
  });

  it("returns null for null input", () => {
    expect(redactUserChanges(null)).toBeNull();
  });
});
