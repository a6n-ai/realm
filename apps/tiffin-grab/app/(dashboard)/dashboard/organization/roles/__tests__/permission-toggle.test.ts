import { describe, expect, it } from "vitest";
import { setPermission } from "../permission-toggle";

describe("setPermission", () => {
  it("adds exactly the one action", () => {
    expect(setPermission({ order: ["read"] }, "order", "update", true)).toEqual({ order: ["read", "update"] });
    expect(setPermission({}, "order", "read", true)).toEqual({ order: ["read"] });
  });

  it("removes exactly the one action and drops an emptied resource", () => {
    expect(setPermission({ order: ["read", "update"] }, "order", "update", false)).toEqual({ order: ["read"] });
    expect(setPermission({ order: ["read"], ac: ["read"] }, "order", "read", false)).toEqual({ ac: ["read"] });
  });

  it("builds the payload from the refreshed server set, not a stale copy", () => {
    const refreshed = { order: ["read"] };
    expect(setPermission(refreshed, "ac", "create", true)).toEqual({ order: ["read"], ac: ["create"] });
    expect(setPermission(refreshed, "order", "read", false)).toEqual({});
  });
});
