import { describe, expect, it } from "vitest";
import type { TiffinCounts } from "@/lib/services/customer-deliveries.service";
import { isPoolScheduleDateEligible, isRescheduleTargetDateEligible } from "../pool-date-eligibility";

const counts = { deliveryWeekdays: ["mon", "wed", "fri"], lastDeliveryDate: null, eatingWeekdays: ["mon", "wed", "thu", "fri"] } as unknown as TiffinCounts;

describe("date pickers follow the customer's eating days", () => {
  it("a non-eating weekday is never offered, an eating day that rides another trip is", () => {
    expect(isRescheduleTargetDateEligible("2026-09-29", counts, "2026-09-21")).toBe(false); // Tue
    expect(isRescheduleTargetDateEligible("2026-09-24", counts, "2026-09-21")).toBe(true); // Thu rides Wed
    expect(isPoolScheduleDateEligible("2026-09-29", counts, "2026-09-21")).toBe(false);
    expect(isPoolScheduleDateEligible("2026-09-24", counts, "2026-09-21")).toBe(true);
  });
  it("legacy plans (no eating days) are unchanged", () => {
    expect(isRescheduleTargetDateEligible("2026-09-29", { ...counts, eatingWeekdays: null }, "2026-09-21")).toBe(true);
  });
});
