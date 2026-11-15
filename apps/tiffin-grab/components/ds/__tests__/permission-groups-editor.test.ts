import { describe, expect, it } from "vitest";
import type { ResourceLabel } from "@foundry/crm";
import { groupCounts, groupsWithAnyOn, toggleGroup } from "../permission-groups-editor";

const areas: ResourceLabel[] = [
  { resource: "order", label: "Orders", actions: [{ action: "read", label: "Read" }, { action: "write", label: "Write" }, { action: "cancel", label: "Cancel" }] },
  { resource: "holiday", label: "Holidays", actions: [{ action: "read", label: "Read" }] },
];

describe("groupCounts", () => {
  it("counts on actions against every action in the group", () => {
    expect(groupCounts({ order: ["read", "cancel"], holiday: ["read"] }, areas)).toEqual({ on: 3, total: 4 });
    expect(groupCounts({}, areas)).toEqual({ on: 0, total: 4 });
  });
});

describe("toggleGroup", () => {
  const all = { order: ["read", "write", "cancel"], holiday: ["read"] };

  it("turns on only the grantable actions and leaves ungrantable ones off", () => {
    const grantable = { order: ["read", "write"] };
    expect(toggleGroup({}, areas, true, grantable)).toEqual({ order: ["read", "write"] });
  });

  it("turns off only the grantable actions and keeps ungrantable ones on", () => {
    const grantable = { order: ["read", "write"] };
    expect(toggleGroup({ order: ["read", "write", "cancel"], holiday: ["read"] }, areas, false, grantable)).toEqual({
      order: ["cancel"],
      holiday: ["read"],
    });
  });

  it("drops a resource it empties, matching what the server stores", () => {
    expect(toggleGroup({ holiday: ["read"] }, areas, false, all)).toEqual({});
  });

  it("is a no-op on the group when nothing is grantable", () => {
    expect(toggleGroup({ order: ["read"] }, areas, true, {})).toEqual({ order: ["read"] });
  });
});

describe("groupsWithAnyOn", () => {
  it("lists only groups with at least one action on", () => {
    expect(groupsWithAnyOn({ order: ["read"] }, areas)).toEqual(["operations"]);
    expect(groupsWithAnyOn({}, areas)).toEqual([]);
  });
});
