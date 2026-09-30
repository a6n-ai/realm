import { describe, expect, it } from "vitest";
import { isFullPostalCode, parseCanadianPostalCode } from "../postal";

describe("parseCanadianPostalCode", () => {
  it.each([
    ["M5V 2T6", "M5V 2T6"],
    ["m5v2t6", "M5V 2T6"],
    ["  L1N  9C4 ", "L1N 9C4"],
    ["k1a 0a1", "K1A 0A1"],
  ])("normalizes %s", (raw, want) => {
    expect(parseCanadianPostalCode(raw)).toBe(want);
  });

  it.each([
    ["M8"], // the bare prefix that let an undeliverable order through
    ["M5V"],
    ["M5V 2T"],
    ["12345"],
    ["D5V 2T6"], // D never used
    ["W5V 2T6"], // W never starts one
    ["M5V 2T6X"],
    [""],
  ])("rejects %s", (raw) => {
    expect(() => parseCanadianPostalCode(raw)).toThrow("Enter a full postal code");
  });

  it("rejects missing input", () => {
    expect(() => parseCanadianPostalCode(null)).toThrow();
  });

  it("isFullPostalCode agrees with the parser", () => {
    expect(isFullPostalCode("m5v 2t6")).toBe(true);
    expect(isFullPostalCode("M4N")).toBe(false);
  });
});
