import { describe, expect, it } from "vitest";
import { setPermission } from "../permission-toggle";
import { samePermissions } from "../role-summary";

const saved = { menu: ["read"], order: ["read", "update"] };

describe("role editor draft", () => {
  it("builds the whole permission set, so the save payload keeps untouched areas", () => {
    const draft = setPermission(saved, "menu", "update", true);
    expect(draft).toEqual({ menu: ["read", "update"], order: ["read", "update"] });
    expect(samePermissions(draft, saved)).toBe(false);
  });

  it("reset returns to the saved set without mutating it", () => {
    const draft = setPermission(setPermission(saved, "order", "update", false), "menu", "read", false);
    expect(samePermissions(draft, saved)).toBe(false);
    expect(samePermissions(saved, { menu: ["read"], order: ["read", "update"] })).toBe(true);
  });
});
