import { describe, expect, it } from "vitest";
import { parseStoredCartFranchise, reconcileCartFranchise, type CartFranchise } from "../franchise";

const TOR: CartFranchise = { clientCode: "PK-TOR", label: "Toronto" };
const VAN: CartFranchise = { clientCode: "PK-VAN", label: "Delta" };
const BRAND: CartFranchise = { clientCode: "PK", label: null };

describe("reconcileCartFranchise", () => {
  it("does nothing when the server resolved no store", () => {
    expect(reconcileCartFranchise({ stored: TOR, active: null, itemCount: 3 })).toEqual({ kind: "in-sync" });
  });

  it("is in sync when the cart was built at the active store", () => {
    expect(reconcileCartFranchise({ stored: TOR, active: TOR, itemCount: 3 })).toEqual({ kind: "in-sync" });
  });

  it("flags a conflict when a non-empty cart belongs to another store", () => {
    expect(reconcileCartFranchise({ stored: TOR, active: VAN, itemCount: 2 })).toEqual({
      kind: "conflict",
      from: TOR,
      to: VAN,
    });
  });

  it("flags a conflict for a cart started before any location was chosen", () => {
    expect(reconcileCartFranchise({ stored: BRAND, active: VAN, itemCount: 1 })).toEqual({
      kind: "conflict",
      from: BRAND,
      to: VAN,
    });
  });

  it("silently adopts the active store when the cart is empty — nothing to lose", () => {
    expect(reconcileCartFranchise({ stored: TOR, active: VAN, itemCount: 0 })).toEqual({ kind: "adopt", franchise: VAN });
  });

  it("adopts rather than blocks a cart saved before carts were tagged", () => {
    expect(reconcileCartFranchise({ stored: null, active: VAN, itemCount: 4 })).toEqual({ kind: "adopt", franchise: VAN });
  });

  it("refreshes the label when the same store is renamed, without a conflict", () => {
    const renamed = { clientCode: "PK-TOR", label: "Scarborough" };
    expect(reconcileCartFranchise({ stored: TOR, active: renamed, itemCount: 2 })).toEqual({
      kind: "adopt",
      franchise: renamed,
    });
  });
});

describe("parseStoredCartFranchise", () => {
  it("round-trips a saved tag", () => {
    expect(parseStoredCartFranchise(JSON.stringify(VAN))).toEqual(VAN);
  });

  it("keeps a brand-default tag's null label", () => {
    expect(parseStoredCartFranchise(JSON.stringify(BRAND))).toEqual(BRAND);
  });

  it.each([null, "", "not json", "[]", "42", JSON.stringify({ label: "Delta" }), JSON.stringify({ clientCode: "" })])(
    "reads %j as untagged",
    (raw) => {
      expect(parseStoredCartFranchise(raw)).toBeNull();
    },
  );
});
