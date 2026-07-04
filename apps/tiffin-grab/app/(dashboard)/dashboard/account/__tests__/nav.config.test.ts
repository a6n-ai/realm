import { describe, it, expect } from "vitest";
import { Role } from "@tiffin/commons";
import { ACCOUNT_NAV, ALLOWED_SECTIONS, isSectionAllowed } from "../nav.config";

function keys(role: keyof typeof ACCOUNT_NAV): string[] {
  return ACCOUNT_NAV[role].flatMap((g) => g.items.map((i) => i.key));
}

describe("ACCOUNT_NAV role gating", () => {
  it("admin exposes the exact staff sections in order", () => {
    expect(keys(Role.ADMIN)).toEqual(["profile", "contact", "security"]);
  });

  it("member matches admin exactly (both resolve to the staff branch)", () => {
    expect(keys(Role.MEMBER)).toEqual(["profile", "contact", "security"]);
    expect(keys(Role.MEMBER)).toEqual(keys(Role.ADMIN));
  });

  it("user exposes the exact customer sections in order", () => {
    expect(keys(Role.USER)).toEqual([
      "profile",
      "contact",
      "address",
      "dietary",
      "deliveryNotes",
      "notifications",
      "security",
    ]);
  });

  it("keeps the Profile -> Delivery -> Security group order for the customer", () => {
    expect(ACCOUNT_NAV[Role.USER].map((g) => g.heading)).toEqual([
      "Profile",
      "Delivery",
      "Security",
    ]);
  });

  it("staff has no Delivery group", () => {
    for (const role of [Role.ADMIN, Role.MEMBER] as const) {
      expect(ACCOUNT_NAV[role].map((g) => g.heading)).toEqual(["Profile", "Security"]);
    }
  });

  it("never exposes customer delivery sections to staff", () => {
    for (const role of [Role.ADMIN, Role.MEMBER] as const) {
      for (const leak of ["address", "dietary", "deliveryNotes", "notifications"] as const) {
        expect(isSectionAllowed(role, leak)).toBe(false);
      }
    }
  });

  it("PIN is never a customer-reachable section (it lives inside the staff-gated security page)", () => {
    // 'pin' is not a nav section for ANY role; the security page renders the PIN
    // control only when the role is staff. So no role should report it allowed.
    for (const role of [Role.ADMIN, Role.MEMBER, Role.USER] as const) {
      expect(isSectionAllowed(role, "pin")).toBe(false);
    }
    expect(keys(Role.USER)).not.toContain("pin");
  });
});

describe("ALLOWED_SECTIONS mirrors ACCOUNT_NAV", () => {
  it("derives the same key set per role", () => {
    for (const role of [Role.ADMIN, Role.MEMBER, Role.USER] as const) {
      expect([...ALLOWED_SECTIONS[role]].sort()).toEqual([...keys(role)].sort());
    }
  });

  it("hrefs point at /dashboard/account/<segment>", () => {
    for (const role of [Role.ADMIN, Role.MEMBER, Role.USER] as const) {
      for (const group of ACCOUNT_NAV[role]) {
        for (const item of group.items) {
          expect(item.href).toMatch(/^\/dashboard\/account\/[a-z-]+$/);
        }
      }
    }
  });
});
