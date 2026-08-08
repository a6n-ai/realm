import { describe, it, expect } from "vitest";
import { chooseDelivery } from "../choose-delivery";
import type { DeliveryType, ZoneWithTypes } from "../zones";

const instant: DeliveryType = {
  key: "instant",
  label: "Instant delivery",
  requiresAddress: true,
  requiresSchedule: false,
  minSubtotal: 0,
  discountPct: 15,
  sortOrder: 1,
  active: true,
};
const scheduled: DeliveryType = {
  key: "scheduled",
  label: "Scheduled delivery",
  requiresAddress: true,
  requiresSchedule: true,
  minSubtotal: 35,
  discountPct: 0,
  sortOrder: 2,
  active: true,
};

// Same shape as the seeded data: Inner (7km) offers instant+scheduled, Outer
// (20km) offers scheduled only.
const inner: ZoneWithTypes = { name: "Inner", radiusKm: 7, active: true, types: [instant, scheduled] };
const outer: ZoneWithTypes = { name: "Outer", radiusKm: 20, active: true, types: [scheduled] };
const zones = [outer, inner];

describe("chooseDelivery", () => {
  it("rejects a type valid only at a shorter distance when requested further out — the exploit", () => {
    const choice = chooseDelivery({ distanceKm: 12, typeKey: "instant", zones, subtotal: 100 });
    expect(choice.ok).toBe(false);
  });

  it("accepts a type genuinely offered at that distance, with the smallest offering zone", () => {
    const choice = chooseDelivery({ distanceKm: 3, typeKey: "instant", zones, subtotal: 100 });
    expect(choice).toMatchObject({ ok: true, type: { key: "instant" }, zone: { name: "Inner" } });
  });

  it("rejects below minSubtotal, naming the real minimum", () => {
    const choice = chooseDelivery({ distanceKm: 3, typeKey: "scheduled", zones, subtotal: 10 });
    expect(choice.ok).toBe(false);
    if (!choice.ok) expect(choice.message).toContain("$35");
  });

  it("rejects requiresSchedule with no scheduledFor", () => {
    const choice = chooseDelivery({ distanceKm: 3, typeKey: "scheduled", zones, subtotal: 100 });
    expect(choice.ok).toBe(false);
    if (!choice.ok) expect(choice.reason).toBe("needs-schedule");
  });

  it("rejects beyond every zone with the limit derived from the zones passed in", () => {
    const choice = chooseDelivery({ distanceKm: 99, typeKey: "scheduled", zones, subtotal: 100 });
    expect(choice.ok).toBe(false);
    if (!choice.ok) expect(choice.message).toContain("20");
  });

  it("rejects an unknown key", () => {
    const choice = chooseDelivery({ distanceKm: 3, typeKey: "teleport", zones, subtotal: 100 });
    expect(choice.ok).toBe(false);
  });

  it("uses the clearer no-delivery message when there are no active zones at all", () => {
    const choice = chooseDelivery({ distanceKm: 3, typeKey: "instant", zones: [], subtotal: 100 });
    expect(choice.ok).toBe(false);
    if (!choice.ok) expect(choice.message).toBe("Delivery is unavailable right now — pickup is available.");
  });
});
