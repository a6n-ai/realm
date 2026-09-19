import { describe, expect, it } from "vitest";
import { buildRows, discountStatus, type DiscountDto } from "./build-rows";

const now = 1_000;
const dto = (o: Partial<DiscountDto>): DiscountDto => ({
  publicId: "d1", name: "n", kind: "delivery", targetPublicId: null, percent: 10, minWeeks: null,
  startsAt: "", endsAt: "", active: true, startsAtMs: null, endsAtMs: null, ...o,
});

describe("discountStatus", () => {
  it("covers every state", () => {
    expect(discountStatus({ active: false }, now)).toBe("inactive");
    expect(discountStatus({ active: true, startsAtMs: 2_000 }, now)).toBe("scheduled");
    expect(discountStatus({ active: true, endsAtMs: 500 }, now)).toBe("expired");
    expect(discountStatus({ active: true, startsAtMs: 500, endsAtMs: 2_000 }, now)).toBe("active");
  });
});

describe("buildRows", () => {
  const rows = buildRows({
    discounts: [dto({}), dto({ publicId: "d2", kind: "duration", targetPublicId: "u1", percent: 5.5 }), dto({ publicId: "d3", targetPublicId: "f1" })],
    frequencies: [{ publicId: "f1", name: "3 Days/Wk" }],
    durations: [{ publicId: "u1", weeks: 8 }],
    mealSizes: [{ publicId: "m1", name: "Small", type: "percent", value: "12.00" }, { publicId: "m2", name: "Big", type: "none", value: 0 }, { publicId: "m3", name: "Med", type: "flat", value: "3.00" }],
    coupons: [
      { publicId: "c1", code: "SAVE", kind: "percentage", valuePct: "15.00", valueAmount: null, active: true, startsAt: null, expiresAt: null },
      { publicId: "c2", code: "OFF5", kind: "fixed", valuePct: null, valueAmount: "5.00", active: true, startsAt: null, expiresAt: 10 },
    ],
    now,
  });
  it("labels, targets and values", () => {
    expect(rows.map((r) => [r.typeLabel, r.appliesTo, r.value])).toEqual([
      ["Delivery type", "All delivery types", "10%"],
      ["Plan length", "8 weeks", "5.5%"],
      ["Delivery type", "3 Days/Wk", "10%"],
      ["List price", "Small", "12%"],
      ["List price", "Med", "$3 off"],
      ["Coupon", "SAVE", "15%"],
      ["Coupon", "OFF5", "$5 off"],
    ]);
  });
  it("redirect hrefs and statuses", () => {
    expect(rows[0].href).toBeNull();
    expect(rows[3].href).toBe("/dashboard/catalog/meal-sizes");
    expect(rows[5].href).toBe("/dashboard/discounts/coupons");
    expect(rows[6].status).toBe("expired");
  });
});
