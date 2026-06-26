import { describe, it, expect } from "vitest";
import { Role } from "@tiffin/commons";
import { SECTION_GROUPS, type SectionKey } from "../sections.config";

function flat(role: keyof typeof SECTION_GROUPS): SectionKey[] {
  return SECTION_GROUPS[role].flatMap((g) => g.sections);
}

describe("SECTION_GROUPS role gating", () => {
  it("admin renders the exact staff section set in order", () => {
    expect(flat(Role.ADMIN)).toEqual(["profile", "contact", "pin", "password"]);
  });

  it("member matches admin exactly (both resolve to the staff branch)", () => {
    expect(flat(Role.MEMBER)).toEqual(["profile", "contact", "pin", "password"]);
    expect(flat(Role.MEMBER)).toEqual(flat(Role.ADMIN));
  });

  it("user renders the exact customer section set in order", () => {
    expect(flat(Role.USER)).toEqual([
      "profile",
      "contact",
      "address",
      "dietary",
      "deliveryNotes",
      "notifications",
      "password",
    ]);
  });

  it("never exposes staff-only PIN to a customer", () => {
    expect(flat(Role.USER)).not.toContain("pin");
  });

  it("never exposes customer delivery sections to staff", () => {
    for (const role of [Role.ADMIN, Role.MEMBER] as const) {
      for (const leak of ["address", "dietary", "deliveryNotes", "notifications"] as const) {
        expect(flat(role)).not.toContain(leak);
      }
    }
  });

  it("keeps the Profile -> Delivery -> Security group order for the customer", () => {
    expect(SECTION_GROUPS[Role.USER].map((g) => g.heading)).toEqual([
      undefined,
      "Delivery",
      "Security",
    ]);
  });
});
