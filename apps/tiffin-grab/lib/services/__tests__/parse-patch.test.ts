import { describe, expect, it } from "vitest";
import { RESOURCES } from "@/app/(dashboard)/dashboard/catalog/resource-config";
import { parsePatch } from "../parse-patch";

describe("parsePatch", () => {
  it("a restore keeps only what was sent: no defaulted items or allowed days", () => {
    expect(parsePatch(RESOURCES["meal-sizes"].schema, { active: true })).toEqual({ active: true });
  });
  it("patches a frequency (a schema with a trailing transform) and derives days per week from sent days", () => {
    expect(parsePatch(RESOURCES["delivery-frequencies"].schema, { active: false })).toEqual({ active: false });
    expect(parsePatch(RESOURCES["delivery-frequencies"].schema, { weekdays: ["mon", "wed", "fri"] })).toEqual({ weekdays: ["mon", "wed", "fri"], daysPerWeek: 3 });
  });
  it("still validates what was sent", () => {
    expect(() => parsePatch(RESOURCES["meal-sizes"].schema, { allowedDays: ["monday"] })).toThrow();
  });
});
