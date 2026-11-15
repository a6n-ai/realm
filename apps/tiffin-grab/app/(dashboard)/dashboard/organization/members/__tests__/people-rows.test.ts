import { describe, expect, it } from "vitest";
import type { ResourceLabel } from "@foundry/crm";
import { toPeopleRows } from "../people-rows";
import type { MemberRow } from "../members-query";

const resources: ResourceLabel[] = [
  { resource: "menu", label: "Menu", actions: [{ action: "read", label: "View" }] },
  { resource: "order", label: "Orders", actions: [{ action: "read", label: "View" }] },
];
const member = (memberId: string, id: string) => ({ id, memberId, orgRole: "kitchen" }) as MemberRow;

describe("toPeopleRows", () => {
  it("merges resolved access into each member row", () => {
    const [row] = toPeopleRows(
      [member("m1", "u1")],
      [{ id: "m1", name: "A", email: null, roles: ["kitchen"], permissions: { menu: ["read"] }, grants: {} }],
      resources,
      null,
      [],
    );
    expect(row.roles).toEqual(["kitchen"]);
    expect(row.areaIds).toEqual(["menu"]);
    expect(row.fullAccess).toBe(false);
  });

  it("leaves a member with no access entry empty, and flags self and above-viewer roles", () => {
    const [none, self] = toPeopleRows(
      [member("m2", "u2"), member("m3", "me")],
      [{ id: "m3", name: "B", email: null, roles: ["owner"], permissions: { menu: ["read"], order: ["read"] }, grants: {} }],
      resources,
      "me",
      ["owner"],
    );
    expect(none.roles).toEqual([]);
    expect(none.areaIds).toEqual([]);
    expect(self.isSelf).toBe(true);
    expect(self.fullAccess).toBe(true);
    expect(self.targetAboveViewer).toBe(true);
  });
});
