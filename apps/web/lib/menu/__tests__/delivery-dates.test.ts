import { describe, expect, it } from "vitest";
import { comingWeekStartIso, mondayOfIso, subscriptionDeliveryDates } from "../delivery-dates";

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri"] as const;

describe("mondayOfIso", () => {
  it("returns the Monday of the week", () => {
    expect(mondayOfIso("2026-06-24")).toBe("2026-06-22"); // Wed -> Mon
    expect(mondayOfIso("2026-06-22")).toBe("2026-06-22"); // Mon -> Mon
    expect(mondayOfIso("2026-06-28")).toBe("2026-06-22"); // Sun -> Mon
  });
});

describe("subscriptionDeliveryDates", () => {
  it("emits durationWeeks × deliveryDays.length dates, starting on/after startDate", () => {
    // Start Wed 2026-06-24, 5 weekdays, 2 weeks = 10 dates
    const r = subscriptionDeliveryDates({ startDate: "2026-06-24", durationWeeks: 2, deliveryDays: [...WEEKDAYS] });
    expect(r).toHaveLength(10);
    expect(r[0].dateIso).toBe("2026-06-24");
    expect(r[0].dayOfWeek).toBe("wed");
    expect(r[0].weekStartIso).toBe("2026-06-22");
    // last of the 10: Wed start → Wed,Thu,Fri (wk1 partial 3) then Mon..Fri (wk2 5) then Mon,Tue (2) = 10
    expect(r[r.length - 1].dateIso).toBe("2026-07-07"); // Tue
  });

  it("only includes the configured delivery weekdays", () => {
    const r = subscriptionDeliveryDates({ startDate: "2026-06-22", durationWeeks: 1, deliveryDays: ["mon", "wed", "fri"] });
    expect(r.map((d) => d.dayOfWeek)).toEqual(["mon", "wed", "fri"]);
    expect(r.map((d) => d.dateIso)).toEqual(["2026-06-22", "2026-06-24", "2026-06-26"]);
  });
});

describe("comingWeekStartIso", () => {
  it("returns next week's Monday relative to 'now' in the zone", () => {
    // Wed 2026-06-24 12:00 UTC, Toronto → current week Mon = 06-22, coming = 06-29
    const now = Date.UTC(2026, 5, 24, 16); // ~noon Toronto
    expect(comingWeekStartIso(now, "America/Toronto")).toBe("2026-06-29");
  });
});
