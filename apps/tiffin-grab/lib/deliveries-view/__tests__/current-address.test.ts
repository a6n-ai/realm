import { describe, expect, it } from "vitest";
import type { SavedAddress } from "@foundry/address";
import { currentSavedAddressId, deliveryAddress } from "../current-address";

const saved = (publicId: string, addressLine: string, postalCode: string, isDefault = false): SavedAddress => ({
  publicId, label: publicId, fullName: null, addressLine, addressUnit: null, city: "Toronto", province: null,
  postalCode, deliveryInstructions: null, isDefault, lat: null, lng: null,
});
const BOOK = [saved("home", "100 King St W", "M5X 1A9", true), saved("work", "200 Bay St", "M5J 2J1"), saved("queen", "100 Queen St W", "M5H 2N2")];
const plan = { addressLine: "100 Queen St W", postalCode: "M5H 2N2" };

describe("currentSavedAddressId", () => {
  it("an inheriting delivery preselects the plan's address, not the default", () => {
    expect(currentSavedAddressId(null, plan, BOOK)).toBe("queen");
  });
  it("a re-addressed delivery preselects its own address; matching ignores case and spacing", () => {
    expect(currentSavedAddressId({ addressLine: "200 bay st", postalCode: "M5J2J1" }, plan, BOOK)).toBe("work");
  });
  it("falls back to the default when nothing matches", () => {
    expect(currentSavedAddressId({ addressLine: "9 Nowhere Rd", postalCode: "K1A 0B1" }, plan, BOOK)).toBe("home");
  });
  it("is null with no saved addresses", () => {
    expect(currentSavedAddressId(null, plan, [])).toBeNull();
  });
});

describe("deliveryAddress", () => {
  const plan = { addressLine: "1 Main St", postalCode: "M5V 2T6" };
  it("shows the plan address when the delivery has none of its own", () => {
    expect(deliveryAddress(null, plan)).toEqual({ text: "1 Main St, M5V 2T6", changed: false });
  });
  it("flags a delivery sent somewhere else", () => {
    expect(deliveryAddress({ addressLine: "9 Office Rd", postalCode: "M4B 1B3" }, plan)).toEqual({ text: "9 Office Rd, M4B 1B3", changed: true });
  });
  it("an override equal to the plan address is not a change", () => {
    expect(deliveryAddress({ addressLine: "1 main st ", postalCode: "m5v2t6" }, plan).changed).toBe(false);
  });
});
