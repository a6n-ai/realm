import { describe, expect, test } from "vitest";
import { fromDateInput, toDateInput, tomorrowInput } from "../dates";

describe("dates", () => {
  test("a date input round-trips to the same day", () => {
    const at = fromDateInput("2026-12-03");
    expect(at).not.toBeNull();
    expect(toDateInput(at as number)).toBe("2026-12-03");
  });

  test("a malformed value is null", () => {
    expect(fromDateInput("12/03/2026")).toBeNull();
    expect(fromDateInput("")).toBeNull();
  });

  test("tomorrow is the next calendar day", () => {
    expect(tomorrowInput(new Date(2026, 11, 31, 22).getTime())).toBe("2027-01-01");
  });
});
