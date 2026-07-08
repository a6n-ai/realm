import { describe, expect, it } from "vitest";
import { ValidationError } from "@realm/commons";
import { parseCategoryCounts } from "../category-counts";

describe("parseCategoryCounts", () => {
  it("accepts positive integer counts", () => {
    expect(parseCategoryCounts({ sabzi: 2, roti: 4 })).toEqual({ sabzi: 2, roti: 4 });
  });
  it("rejects zero / negative / non-integer", () => {
    expect(() => parseCategoryCounts({ sabzi: 0 })).toThrow(ValidationError);
    expect(() => parseCategoryCounts({ sabzi: -1 })).toThrow(ValidationError);
    expect(() => parseCategoryCounts({ sabzi: 1.5 })).toThrow(ValidationError);
  });
  it("rejects non-object", () => {
    expect(() => parseCategoryCounts("x")).toThrow(ValidationError);
  });
});
