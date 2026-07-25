import { describe, expect, it } from "vitest";
import { ALL_ADMIN_ROUTES } from "../admin/routes";
import { PUBLIC_ROUTES } from "../public/routes";
import { CUSTOMER_ROUTES } from "../customer/routes";

/**
 * Unit checks on the E2E route registries (no browser).
 * Keeps feature coverage lists honest: unique ids/paths, no empty headings.
 */
describe("e2e route registries", () => {
  it("admin routes have unique ids and paths", () => {
    const ids = ALL_ADMIN_ROUTES.map((r) => r.id);
    const paths = ALL_ADMIN_ROUTES.map((r) => r.path);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(paths).size).toBe(paths.length);
    for (const r of ALL_ADMIN_ROUTES) {
      expect(r.path.startsWith("/dashboard")).toBe(true);
      expect(r.heading).toBeTruthy();
    }
  });

  it("public routes have unique ids", () => {
    const ids = PUBLIC_ROUTES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("customer routes stay under /me", () => {
    for (const r of CUSTOMER_ROUTES) {
      expect(r.path.startsWith("/me")).toBe(true);
    }
    const ids = CUSTOMER_ROUTES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
