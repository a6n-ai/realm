import { describe, expect, it } from "vitest";
import { orderDeliveryDays } from "../delivery-days";

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
