import { describe, it, expect } from "vitest";
import { Role } from "@foundry/commons";
import { ACCOUNT_SECTIONS, accountSectionHref, sectionFromSlug, sectionsForRole } from "../sections.config";

const keys = (role: Parameters<typeof sectionsForRole>[0]) => sectionsForRole(role).map((s) => s.key);

describe("account sections", () => {
  it("customers get every section", () => {
    expect(keys(Role.USER).sort()).toEqual(ACCOUNT_SECTIONS.map((s) => s.key).sort());
  });

  it("staff never see the customer-only sections", () => {
    for (const role of [Role.ADMIN, Role.MEMBER]) {
      expect(keys(role)).toEqual(expect.arrayContaining(["profile", "security"]));
      expect(keys(role)).not.toEqual(expect.arrayContaining(["address"]));
      expect(keys(role)).not.toEqual(expect.arrayContaining(["dietary"]));
      expect(keys(role)).not.toEqual(expect.arrayContaining(["deliveryNotes"]));
      expect(keys(role)).not.toEqual(expect.arrayContaining(["notifications"]));
    }
  });

  it("links stay on the single page", () => {
    for (const s of ACCOUNT_SECTIONS) expect(accountSectionHref(s)).toBe(`/me/account?section=${s.slug}`);
  });

  it("resolves slugs only within the allowed set", () => {
    expect(sectionFromSlug("delivery-notes", sectionsForRole(Role.USER))?.key).toBe("deliveryNotes");
    expect(sectionFromSlug("address", sectionsForRole(Role.ADMIN))).toBeNull();
    expect(sectionFromSlug(undefined, sectionsForRole(Role.USER))).toBeNull();
  });
});
