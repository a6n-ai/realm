import { describe, expect, it } from "vitest";
import { driverNote } from "@/lib/services/daily-labels.service";
import { stopNotes } from "../trip-notes";

describe("driver note", () => {
  it("puts the drop-off ahead of the address note, and is null when both are empty", () => {
    expect(driverNote("Apartment: Lobby", " Buzz 1185 ")).toBe("Apartment: Lobby · Buzz 1185");
    expect(driverNote(null, "Buzz 1185")).toBe("Buzz 1185");
    expect(driverNote("Home", "  ")).toBe("Home");
    expect(driverNote(null, null)).toBeNull();
  });

  it("leads the stop notes with the unit, then the same note the label prints", () => {
    const trip = { coverage: "Covers Mon + Tue · 2 tiffins", dishLines: ["Mon: Dal"] };
    expect(stopNotes(" 5 ", "Apartment: Lobby · Buzz 1185", trip)).toBe(
      "Unit 5\nApartment: Lobby · Buzz 1185\nCovers Mon + Tue · 2 tiffins\nMon: Dal",
    );
    expect(stopNotes(null, null, { coverage: null, dishLines: [] })).toBe("");
  });
});
