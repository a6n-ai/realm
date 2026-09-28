import { describe, expect, it } from "vitest";
import { dropOffCatalog, dropOffFee, dropOffSummary, pickInConnection, pickTag, toggleStrategy, validDropOff } from "../drop-off";

const catalog = dropOffCatalog({
  baseCharge: 0,
  strategyGroups: [
    { publicId: "apt", name: "Apartment", description: null },
    { publicId: "home", name: "Home", description: null },
  ],
  strategyConnections: [{ publicId: "spot", name: "Drop-off", groupId: "apt" }],
  deliveryStrategies: [
    { id: "lobby", name: "Lobby", description: null, chargeType: "none", chargeValue: 0, groupId: "apt", connectionId: "spot", chargeBasis: "once" },
    { id: "door", name: "Leave at door", description: null, chargeType: "fixed", chargeValue: 1.5, groupId: "apt", connectionId: "spot", chargeBasis: "per_delivery" },
    { id: "call", name: "Call on arrival", description: null, chargeType: "none", chargeValue: 0, groupId: "apt", connectionId: null, chargeBasis: "once" },
    { id: "porch", name: "Porch", description: null, chargeType: "none", chargeValue: 0, groupId: "home", connectionId: null, chargeBasis: "once" },
    { id: "legacy", name: "Old", description: null, chargeType: "none", chargeValue: 0, groupId: null, connectionId: null, chargeBasis: "once" },
  ],
  addressTags: [],
});

describe("drop-off model", () => {
  it("never offers an untagged strategy", () => {
    expect(catalog.options.map((o) => o.publicId)).toEqual(["lobby", "door", "call", "porch"]);
  });

  it("free strategies combine; a connected set holds one", () => {
    let v = toggleStrategy(catalog, { tagId: "apt", strategyIds: [] }, "call");
    v = toggleStrategy(catalog, v, "lobby");
    expect(v).toEqual({ tagId: "apt", strategyIds: ["call", "lobby"] });
    // Door replaces Lobby: same set, different price.
    expect(toggleStrategy(catalog, v, "door").strategyIds).toEqual(["call", "door"]);
    expect(pickInConnection(catalog, v, "spot", null).strategyIds).toEqual(["call"]);
    // Toggling off.
    expect(toggleStrategy(catalog, v, "call").strategyIds).toEqual(["lobby"]);
  });

  it("a strategy picks its tag, and a new tag drops the old tag's strategies", () => {
    expect(toggleStrategy(catalog, { tagId: null, strategyIds: [] }, "porch")).toEqual({ tagId: "home", strategyIds: ["porch"] });
    expect(pickTag({ tagId: "apt", strategyIds: ["call"] }, "home")).toEqual({ tagId: "home", strategyIds: [] });
    expect(pickTag({ tagId: "apt", strategyIds: ["call"] }, null)).toEqual({ tagId: null, strategyIds: [] });
  });

  it("drops stale picks and summarises", () => {
    expect(validDropOff(catalog, { tagId: "apt", strategyIds: ["porch", "gone", "lobby", "door", "call"] })).toEqual({
      tagId: "apt",
      strategyIds: ["lobby", "call"],
    });
    expect(validDropOff(catalog, { tagId: "retired", strategyIds: ["call"] })).toEqual({ tagId: null, strategyIds: [] });
    expect(dropOffSummary(catalog, { tagId: "apt", strategyIds: ["lobby", "call"] })).toBe("Apartment: Lobby, Call on arrival");
    expect(dropOffSummary(catalog, { tagId: "home", strategyIds: [] })).toBe("Home");
  });

  it("labels a per-delivery price as such", () => {
    const door = catalog.options.find((o) => o.publicId === "door")!;
    expect(dropOffFee(door)).toBe("+$1.50 / delivery");
  });
});
