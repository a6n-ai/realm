import { describe, it, expect } from "vitest";
import { CUSTOMER_ACCOUNT_NAV, customerSectionFromPath } from "../nav.config";

describe("CUSTOMER_ACCOUNT_NAV", () => {
  it("lists customer account sections in the same order as dashboard USER_NAV", () => {
    expect(CUSTOMER_ACCOUNT_NAV.map((item) => item.key)).toEqual([
      "profile",
      "contact",
      "address",
      "dietary",
      "deliveryNotes",
      "notifications",
      "security",
    ]);
  });

  it("uses /me/* hrefs for every section", () => {
    for (const item of CUSTOMER_ACCOUNT_NAV) {
      expect(item.href).toMatch(/^\/me\/[a-z-]+$/);
    }
  });

  it("maps delivery-notes path to deliveryNotes key", () => {
    expect(customerSectionFromPath("/me/delivery-notes")).toBe("deliveryNotes");
  });
});
