import { describe, expect, it } from "vitest";
import { sanitizeClientError } from "../client-error";

describe("sanitizeClientError", () => {
  it("returns fallback for Minified React error #441 error instances", () => {
    const err = new Error(
      "Minified React error #441; visit https://reactjs.org/docs/error-decoder.html?invariant=441 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.",
    );
    expect(sanitizeClientError(err)).toBe("Something went wrong. Please try again.");
    expect(sanitizeClientError(err, "Custom fallback")).toBe("Custom fallback");
  });

  it("returns fallback for Minified React error string directly", () => {
    const raw = "Minified React error #441";
    expect(sanitizeClientError(raw)).toBe("Something went wrong. Please try again.");
  });

  it("returns fallback for Server Components render errors", () => {
    const err = new Error("An error occurred in the Server Components render.");
    expect(sanitizeClientError(err)).toBe("Something went wrong. Please try again.");
  });

  it("returns user-facing messages as-is when they are safe", () => {
    expect(sanitizeClientError(new Error("Dish name is required"))).toBe("Dish name is required");
    expect(sanitizeClientError("Session expired. Please log in again.")).toBe("Session expired. Please log in again.");
  });

  it("handles object with error property", () => {
    expect(sanitizeClientError({ error: "Invalid payment amount" })).toBe("Invalid payment amount");
    expect(
      sanitizeClientError({ error: "Minified React error #441; invariant=441" }, "Action failed"),
    ).toBe("Action failed");
  });

  it("handles null, undefined, empty string, or empty error", () => {
    expect(sanitizeClientError(null)).toBe("Something went wrong. Please try again.");
    expect(sanitizeClientError(undefined)).toBe("Something went wrong. Please try again.");
    expect(sanitizeClientError("")).toBe("Something went wrong. Please try again.");
    expect(sanitizeClientError(new Error(""))).toBe("Something went wrong. Please try again.");
    expect(sanitizeClientError({}, "Fallback")).toBe("Fallback");
  });
});
