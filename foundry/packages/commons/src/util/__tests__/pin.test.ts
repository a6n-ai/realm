import { describe, expect, it } from "vitest";
import { pinSchema } from "../pin";

describe("pinSchema", () => {
  it("accepts non-trivial 4-digit PINs", () => {
    for (const ok of ["1357", "2580", "8024", "1029"]) {
      expect(pinSchema.safeParse(ok).success).toBe(true);
    }
  });

  it("rejects non-4-digit or non-numeric input", () => {
    for (const bad of ["123", "12345", "12a4", "", "1.34"]) {
      expect(pinSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("rejects four-of-a-kind", () => {
    for (const bad of ["0000", "1111", "9999"]) {
      expect(pinSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("rejects straight ascending/descending runs", () => {
    for (const bad of ["0123", "1234", "6789", "4321", "9876", "3210"]) {
      expect(pinSchema.safeParse(bad).success).toBe(false);
    }
  });
});
