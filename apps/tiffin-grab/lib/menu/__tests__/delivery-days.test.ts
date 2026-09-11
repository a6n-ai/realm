import { describe, expect, it } from "vitest";
import { clubbedQuantities, customFrequencyKey, orderDeliveryDays, type DayOfWeek } from "../delivery-days";

describe("orderDeliveryDays", () => {
  it("5_day → mon..fri", () => {
    expect(orderDeliveryDays({ frequencyKey: "5_day", includeSaturday: false, includeSunday: false }))
      .toEqual(["mon", "tue", "wed", "thu", "fri"]);
  });
  it("mwf → mon/wed/fri", () => {
    expect(orderDeliveryDays({ frequencyKey: "mwf", includeSaturday: false, includeSunday: false }))
      .toEqual(["mon", "wed", "fri"]);
  });
  it("adds weekend days", () => {
    expect(orderDeliveryDays({ frequencyKey: "5_day", includeSaturday: true, includeSunday: true }))
      .toEqual(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
  });
});

describe("customFrequencyKey", () => {
  it("is order-independent (sorted by week position)", () => {
    expect(customFrequencyKey(["thu", "tue"])).toBe("custom_tue_thu");
    expect(customFrequencyKey(["tue", "thu"])).toBe("custom_tue_thu");
  });
});

describe("clubbedQuantities", () => {
  it("the worked example: Tue/Thu/Fri", () => {
    // Tue covers Tue+Wed (2), Thu covers itself only since Fri is next (1),
    // Fri covers Fri+Sat+Sun+Mon since Tue is the next selected day (4).
    expect(clubbedQuantities(["tue", "thu", "fri"])).toEqual({ tue: 2, thu: 1, fri: 4 });
  });

  it("MWF splits the week into three even 2/2/3 spans", () => {
    // Mon covers Mon+Tue (2), Wed covers Wed+Thu (2), Fri covers Fri+Sat+Sun (3).
    expect(clubbedQuantities(["mon", "wed", "fri"])).toEqual({ mon: 2, wed: 2, fri: 3 });
  });

  it("every day selected gives 1 tiffin per day", () => {
    const all: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    const result = clubbedQuantities(all);
    for (const d of all) expect(result[d]).toBe(1);
  });

  it("a single selected day absorbs the whole week", () => {
    expect(clubbedQuantities(["wed"])).toEqual({ wed: 7 });
  });

  it("quantities always sum to 7 (one tiffin for every calendar day)", () => {
    const patterns: DayOfWeek[][] = [["mon"], ["tue", "thu"], ["mon", "wed", "fri"], ["mon", "tue", "wed", "thu", "fri"]];
    for (const p of patterns) {
      const sum = Object.values(clubbedQuantities(p)).reduce((a, b) => a + b, 0);
      expect(sum).toBe(7);
    }
  });
});
