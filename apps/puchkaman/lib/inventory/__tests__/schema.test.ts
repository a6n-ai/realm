import { describe, expect, it } from "vitest";
import { categoryEditSchema, modifierGroupEditSchema } from "../schema";

const CATEGORY = { name: "Chaats", sortOrder: 3, colorCode: "#FF0080", active: true };
const GROUP = {
  name: "Spice level",
  alternateName: null,
  minRequired: 1,
  maxAllowed: 2,
  showByDefault: true,
  sortOrder: 0,
  active: true,
};

describe("categoryEditSchema", () => {
  it("accepts a well-formed category", () => {
    expect(categoryEditSchema.parse(CATEGORY)).toMatchObject(CATEGORY);
  });

  it("treats a blank colour as cleared rather than invalid", () => {
    expect(categoryEditSchema.parse({ ...CATEGORY, colorCode: "" }).colorCode).toBeNull();
  });

  it("rejects a colour that is not 6-digit hex", () => {
    expect(categoryEditSchema.safeParse({ ...CATEGORY, colorCode: "red" }).success).toBe(false);
    expect(categoryEditSchema.safeParse({ ...CATEGORY, colorCode: "#FFF" }).success).toBe(false);
  });

  it("rejects an empty name", () => {
    expect(categoryEditSchema.safeParse({ ...CATEGORY, name: "   " }).success).toBe(false);
  });
});

describe("modifierGroupEditSchema", () => {
  it("accepts a well-formed group", () => {
    expect(modifierGroupEditSchema.parse(GROUP)).toMatchObject(GROUP);
  });

  it("allows both selection bounds to be absent — Clover reads that as no constraint", () => {
    const parsed = modifierGroupEditSchema.parse({
      ...GROUP,
      minRequired: null,
      maxAllowed: null,
    });
    expect(parsed.minRequired).toBeNull();
    expect(parsed.maxAllowed).toBeNull();
  });

  it("rejects a max below the min instead of pushing it to the POS", () => {
    const res = modifierGroupEditSchema.safeParse({ ...GROUP, minRequired: 3, maxAllowed: 1 });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toMatch(/Max allowed/);
    }
  });

  it("allows max equal to min — 'exactly n'", () => {
    expect(
      modifierGroupEditSchema.safeParse({ ...GROUP, minRequired: 2, maxAllowed: 2 }).success,
    ).toBe(true);
  });

  it("does not constrain a bound that is only set on one side", () => {
    expect(
      modifierGroupEditSchema.safeParse({ ...GROUP, minRequired: 5, maxAllowed: null }).success,
    ).toBe(true);
  });
});
