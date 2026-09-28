import { describe, expect, it, vi } from "vitest";

const zone = (name: string, postalPrefixes: string[], active = true) => ({
  id: BigInt(name.length), publicId: `zon_${name}`, name, radiusKm: null, postalPrefixes, slotWindow: null, active,
});

vi.mock("@/lib/catalog/load", () => ({
  loadCatalogSnapshot: async () => ({
    zones: [zone("Etobicoke", ["M8", "M9"]), zone("Durham", ["L1N"]), zone("Closed", ["K1A"], false)],
  }),
}));

const { assertAddressServiceable } = await import("../zone-match");

const addr = (postalCode: string) => ({ addressLine: "1 Main St", city: "Toronto", postalCode });

describe("assertAddressServiceable", () => {
  it("accepts a full postal code inside an active zone", async () => {
    await expect(assertAddressServiceable(addr("m8v 1a1"))).resolves.toBeUndefined();
    await expect(assertAddressServiceable(addr("L1N 9C4"))).resolves.toBeUndefined();
  });

  it("refuses a postal code no zone serves", async () => {
    await expect(assertAddressServiceable(addr("V6B 1A1"))).rejects.toThrow("We don't deliver to V6B 1A1 yet");
  });

  it("ignores inactive zones", async () => {
    await expect(assertAddressServiceable(addr("K1A 0A1"))).rejects.toThrow("We don't deliver");
  });

  it("rejects a bare prefix before it can match a zone", async () => {
    await expect(assertAddressServiceable(addr("M8"))).rejects.toThrow("Enter a full postal code");
  });
});
