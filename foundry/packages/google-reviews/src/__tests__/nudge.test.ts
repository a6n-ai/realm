import { describe, it, expect } from "vitest";
import { shouldNudge, writeReviewUrl } from "../nudge";

describe("shouldNudge", () => {
  it("is true when the customer has never been nudged", () => {
    expect(shouldNudge(undefined)).toBe(true);
    expect(shouldNudge({ sentAt: null, doneAt: null })).toBe(true);
  });

  it("is false once an email has been sent", () => {
    expect(shouldNudge({ sentAt: new Date("2026-08-01"), doneAt: null })).toBe(false);
  });

  it("is false once the customer has clicked or dismissed", () => {
    expect(shouldNudge({ sentAt: null, doneAt: new Date("2026-08-01") })).toBe(false);
  });
});

describe("writeReviewUrl", () => {
  it("builds the Google write-review link for a place", () => {
    expect(writeReviewUrl("ChIJabc")).toBe(
      "https://search.google.com/local/writereview?placeid=ChIJabc",
    );
  });

  it("url-encodes the place id", () => {
    expect(writeReviewUrl("a b")).toBe(
      "https://search.google.com/local/writereview?placeid=a%20b",
    );
  });
});
