import { describe, expect, it } from "vitest";
import { dropOffCatalog, dropOffSummary, pickDropOff, validDropOffs } from "../drop-off";

const catalog = dropOffCatalog({
  baseCharge: 0,
  strategyGroups: [
    { publicId: "spot", name: "Drop-off spot", description: null, required: true },
    { publicId: "contact", name: "Contact", description: null, required: false },
    { publicId: "empty", name: "Unused", description: null, required: false },
  ],
  deliveryStrategies: [
    { id: "door", name: "Doorstep", description: null, chargeType: "none", chargeValue: 0, groupId: "spot" },
    { id: "lobby", name: "Lobby", description: null, chargeType: "fixed", chargeValue: 1.5, groupId: "spot" },
    { id: "call", name: "Call", description: null, chargeType: "none", chargeValue: 0, groupId: "contact" },
    { id: "legacy", name: "Old", description: null, chargeType: "none", chargeValue: 0, groupId: null },
  ],
  addressTags: [],
});

describe("drop-off catalog", () => {
  it("offers only groups with options, and never ungrouped options", () => {
    expect(catalog.groups.map((g) => g.publicId)).toEqual(["spot", "contact"]);
    expect(catalog.options.map((o) => o.publicId)).toEqual(["door", "lobby", "call"]);
  });

  it("keeps one pick per question", () => {
    expect(pickDropOff(catalog, ["door", "call"], "spot", "lobby")).toEqual(["call", "lobby"]);
    expect(pickDropOff(catalog, ["door", "call"], "contact", null)).toEqual(["door"]);
  });

  it("drops stale picks and orders by question", () => {
    expect(validDropOffs(catalog, ["call", "gone", "lobby", "door"])).toEqual(["lobby", "call"]);
    expect(dropOffSummary(catalog, ["call", "lobby"])).toBe("Drop-off spot: Lobby · Contact: Call");
  });
});
