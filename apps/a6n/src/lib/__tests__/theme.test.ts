import { describe, expect, test } from "vitest";
import { stepTheme } from "../theme";

describe("stepTheme", () => {
  test("moves System, Light, Dark and wraps at both ends", () => {
    expect(stepTheme("system", 1)).toBe("light");
    expect(stepTheme("light", 1)).toBe("dark");
    expect(stepTheme("dark", 1)).toBe("system");
    expect(stepTheme("system", -1)).toBe("dark");
    expect(stepTheme("dark", -1)).toBe("light");
  });
});
