import { describe, expect, it } from "vitest";
import { ageOn, checkAge } from "../age";

describe("ageOn", () => {
  it("counts whole years", () => {
    expect(ageOn("2023-10-26", "2026-10-25")).toBe(2);
    expect(ageOn("2023-10-26", "2026-10-26")).toBe(3);
  });
  it("Feb 29 birthday counts as Mar 1 in non-leap years", () => {
    expect(ageOn("2020-02-29", "2023-02-28")).toBe(2);
    expect(ageOn("2020-02-29", "2023-03-01")).toBe(3);
    expect(ageOn("2020-02-29", "2024-02-29")).toBe(4);
  });
});

describe("checkAge", () => {
  const cls = { ageMin: 3, ageMax: 6, ageWaiver: false };
  it("blocks out of range, waiver when allowed, ok in range", () => {
    expect(checkAge(cls, 2)).toBe("blocked");
    expect(checkAge(cls, 7)).toBe("blocked");
    expect(checkAge({ ...cls, ageWaiver: true }, 2)).toBe("waiver");
    expect(checkAge(cls, 3)).toBe("ok");
    expect(checkAge(cls, 6)).toBe("ok");
  });
  it("null bounds are unbounded", () => {
    expect(checkAge({ ageMin: null, ageMax: 6, ageWaiver: false }, 0)).toBe("ok");
    expect(checkAge({ ageMin: 3, ageMax: null, ageWaiver: false }, 40)).toBe("ok");
  });
});
