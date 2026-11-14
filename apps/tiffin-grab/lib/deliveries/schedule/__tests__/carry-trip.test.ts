import { describe, expect, it } from "vitest";
import {
  carryTripDateIso,
  formatEatDayCarryPreview,
  previewEatDayCarry,
} from "../carry-trip";
import type { DayOfWeek } from "../delivery-days";

const MWF: DayOfWeek[] = ["mon", "wed", "fri"];
const FIVE: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri"];

describe("carryTripDateIso", () => {
  it("MWF: Tue→Mon, Thu→Wed, Sat/Sun→Fri, delivery days stay put", () => {
    // Week of 2026-09-21 (Mon)
    expect(carryTripDateIso("2026-09-21", MWF)).toBe("2026-09-21"); // Mon
    expect(carryTripDateIso("2026-09-22", MWF)).toBe("2026-09-21"); // Tue→Mon
    expect(carryTripDateIso("2026-09-23", MWF)).toBe("2026-09-23"); // Wed
    expect(carryTripDateIso("2026-09-24", MWF)).toBe("2026-09-23"); // Thu→Wed
    expect(carryTripDateIso("2026-09-25", MWF)).toBe("2026-09-25"); // Fri
    expect(carryTripDateIso("2026-09-26", MWF)).toBe("2026-09-25"); // Sat→Fri
    expect(carryTripDateIso("2026-09-27", MWF)).toBe("2026-09-25"); // Sun→Fri
  });

  it("5-day: weekends snap to Friday; weekdays are themselves", () => {
    expect(carryTripDateIso("2026-09-23", FIVE)).toBe("2026-09-23"); // Wed
    expect(carryTripDateIso("2026-09-26", FIVE)).toBe("2026-09-25"); // Sat→Fri
    expect(carryTripDateIso("2026-09-27", FIVE)).toBe("2026-09-25"); // Sun→Fri
  });

  it("never snaps forward — Mon on a Tue-first pattern walks back to prior Fri", () => {
    const tueThuFri: DayOfWeek[] = ["tue", "thu", "fri"];
    // 2026-09-21 is Mon → prior Fri 2026-09-18
    expect(carryTripDateIso("2026-09-21", tueThuFri)).toBe("2026-09-18");
  });

  it("crosses month boundary when walking back", () => {
    // 2026-10-01 is Thu; MWF → Wed 2026-09-30
    expect(carryTripDateIso("2026-10-01", MWF)).toBe("2026-09-30");
  });

  it("returns null for empty frequency or bad ISO", () => {
    expect(carryTripDateIso("2026-09-22", [])).toBeNull();
    expect(carryTripDateIso("not-a-date", MWF)).toBeNull();
  });
});

describe("previewEatDayCarry / formatEatDayCarryPreview", () => {
  it("marks snapped vs on-pattern and formats copy", () => {
    const tue = previewEatDayCarry("2026-09-22", MWF)!;
    expect(tue.snapped).toBe(true);
    expect(tue.carriedOn).toBe("2026-09-21");
    expect(formatEatDayCarryPreview(tue)).toBe("Tue 22 → delivered with your Mon 21 delivery");

    const mon = previewEatDayCarry("2026-09-21", MWF)!;
    expect(mon.snapped).toBe(false);
    expect(formatEatDayCarryPreview(mon)).toBe("Mon 21 is a delivery day — food arrives that day");

    expect(
      formatEatDayCarryPreview(tue, { targetAlreadyHasTrip: true, targetUnitsAfter: 2 }),
    ).toContain("will then carry 2 days");
  });
});
