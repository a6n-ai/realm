import { describe, expect, it } from "vitest";
import type { TiffinCounts } from "@/lib/services/customer-deliveries.service";
import { isPoolScheduleDateEligible, isRescheduleTargetDateEligible } from "../pool-date-eligibility";

const counts = { deliveryWeekdays: ["mon", "wed", "fri"], lastDeliveryDate: null } as unknown as TiffinCounts;

describe("date pickers allow any of the plan's delivery weekdays", () => {
  it("any delivery weekday is eligible, off-pattern days are not", () => {
    expect(isRescheduleTargetDateEligible("2026-09-23", counts, "2026-09-21")).toBe(true); // Wed
    expect(isRescheduleTargetDateEligible("2026-09-24", counts, "2026-09-21")).toBe(true); // Thu rides Wed
    expect(isPoolScheduleDateEligible("2026-09-23", counts, "2026-09-21")).toBe(true);
  });
});
