import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/coupons.service", () => ({ couponsService: {} }));
vi.mock("@/lib/services/promotions.service", () => ({ promotionsService: {} }));
vi.mock("@/lib/promotions/live", () => ({ hasPlacement: () => false }));

const { ownImagePath } = await import("@/lib/landing/promos");

describe("ownImagePath", () => {
  it("keeps only the path for our own /landing photos", () => {
    expect(ownImagePath("https://tiffingrab.ca/landing/stock/dish-spread.jpg")).toBe("/landing/stock/dish-spread.jpg");
    expect(ownImagePath("https://app.tiffingrab.ca/landing/a.jpg")).toBe("/landing/a.jpg");
  });
  it("leaves other hosts, paths, queries and junk alone", () => {
    expect(ownImagePath("https://cdn.example.com/landing/a.jpg")).toBe("https://cdn.example.com/landing/a.jpg");
    expect(ownImagePath("https://eviltiffingrab.ca/landing/a.jpg")).toBe("https://eviltiffingrab.ca/landing/a.jpg");
    expect(ownImagePath("https://tiffingrab.ca/api/files/x.jpg")).toBe("https://tiffingrab.ca/api/files/x.jpg");
    expect(ownImagePath("https://tiffingrab.ca/landing/a.jpg?v=2")).toBe("https://tiffingrab.ca/landing/a.jpg?v=2");
    expect(ownImagePath("/landing/a.jpg")).toBe("/landing/a.jpg");
    expect(ownImagePath(null)).toBeNull();
  });
});
