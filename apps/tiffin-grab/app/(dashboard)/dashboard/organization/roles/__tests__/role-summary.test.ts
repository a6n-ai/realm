import { describe, expect, it } from "vitest";
import type { ResourceLabel } from "@foundry/crm";
import { areasOf, countOn, countPermissions, isGrantableAction, samePermissions, totalPermissions } from "../role-summary";

const resources: ResourceLabel[] = [
  { resource: "order", label: "Orders", actions: [{ action: "read", label: "View" }, { action: "update", label: "Edit" }] },
  { resource: "menu", label: "Menu", actions: [{ action: "read", label: "View" }] },
  { resource: "ac", label: "Access", actions: [{ action: "read", label: "View" }] },
];

describe("role summary", () => {
  it("counts actions and areas a role touches", () => {
    const value = { order: ["read", "update"], ac: [] };
    expect(countPermissions(value)).toBe(2);
    expect(totalPermissions(resources)).toBe(4);
    expect(areasOf(value, resources).map((r) => r.label)).toEqual(["Orders"]);
    expect(countOn(value, resources[0])).toBe(2);
  });

  it("treats only listed actions as grantable", () => {
    expect(isGrantableAction({ order: ["read"] }, "order", "read")).toBe(true);
    expect(isGrantableAction({ order: ["read"] }, "order", "update")).toBe(false);
    expect(isGrantableAction({}, "menu", "read")).toBe(false);
  });

  it("compares permission sets regardless of key or action order", () => {
    expect(samePermissions({ order: ["read", "update"], menu: ["read"] }, { menu: ["read"], order: ["update", "read"] })).toBe(true);
    expect(samePermissions({ order: ["read"] }, { order: ["read", "update"] })).toBe(false);
    expect(samePermissions({ order: [] }, {})).toBe(true);
  });
});
