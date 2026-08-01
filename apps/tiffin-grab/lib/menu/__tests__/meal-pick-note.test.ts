import { describe, expect, it } from "vitest";
import { mealPickNote } from "../meal-pick-note";

const base = {
  deliveryDateIso: "2026-08-04",
  categoryLabel: "Sabzi",
  personIndex: 1,
  persons: 1,
  to: "Paneer Butter Masala",
};

describe("mealPickNote", () => {
  it("records the outgoing dish, which is what answers 'why did I get this?'", () => {
    expect(mealPickNote({ ...base, from: "Aloo Gobi" })).toBe(
      "2026-08-04 · Sabzi: Aloo Gobi → Paneer Butter Masala",
    );
  });

  it("reads as a first pick when there was no prior dish", () => {
    expect(mealPickNote({ ...base, from: null })).toBe("2026-08-04 · Sabzi: Paneer Butter Masala");
  });

  it("names the person only on multi-person orders", () => {
    expect(mealPickNote({ ...base, from: null, personIndex: 2, persons: 3 })).toBe(
      "2026-08-04 · Sabzi (person 2 of 3): Paneer Butter Masala",
    );
  });
});
