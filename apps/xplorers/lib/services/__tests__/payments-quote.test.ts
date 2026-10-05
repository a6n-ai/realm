import { describe, expect, it } from "vitest";
import { isIanaTimeZone } from "@/lib/app-clock";

describe("isIanaTimeZone", () => {
  it("accepts Asia/Singapore and rejects garbage", () => {
    expect(isIanaTimeZone("Asia/Singapore")).toBe(true);
    expect(isIanaTimeZone("Not/AZone")).toBe(false);
  });
});
