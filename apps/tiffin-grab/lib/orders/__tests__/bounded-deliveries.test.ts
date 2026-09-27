import { describe, expect, it } from "vitest";
import { buildBoundedDeliveryRows, tripsFor } from "../bounded-deliveries";

describe("buildBoundedDeliveryRows", () => {
  it("carries a Saturday eating day on Friday (no Saturday row) and stops at the target", () => {
    // Monday 2026-09-21; eating Mon + Sat on the 5-day route -> trips Mon(1), Fri(1 carrying Sat).
    const rows = buildBoundedDeliveryRows({ startDate: "2026-09-21", trips: tripsFor("5_day", ["mon", "sat"]), persons: 1, targetTiffinCount: 3 });
    expect(rows).toEqual([
      { deliveryDate: "2026-09-21", tiffinUnits: 1, coversDates: ["2026-09-21"] },
      { deliveryDate: "2026-09-25", tiffinUnits: 1, coversDates: ["2026-09-26"] },
      { deliveryDate: "2026-09-28", tiffinUnits: 1, coversDates: ["2026-09-28"] },
    ]);
  });

  it("clamps the crossing row and its coverage to the remaining balance", () => {
    // Mon..Fri eating on MWF: Mon(2: mon+tue), Wed(2: wed+thu), Fri(1); target 3 -> Mon 2, Wed 1.
    const rows = buildBoundedDeliveryRows({ startDate: "2026-09-21", trips: tripsFor("mwf", ["mon", "tue", "wed", "thu", "fri"]), persons: 1, targetTiffinCount: 3 });
    expect(rows).toEqual([
      { deliveryDate: "2026-09-21", tiffinUnits: 2, coversDates: ["2026-09-21", "2026-09-22"] },
      { deliveryDate: "2026-09-23", tiffinUnits: 1, coversDates: ["2026-09-23"] },
    ]);
  });

  it("multiplies units by persons", () => {
    const rows = buildBoundedDeliveryRows({ startDate: "2026-09-21", trips: tripsFor("5_day", ["mon", "tue", "wed", "thu", "fri"]), persons: 2, targetTiffinCount: 5 });
    expect(rows.map((r) => r.tiffinUnits)).toEqual([2, 2, 1]);
  });
});
