import { describe, expect, it } from "vitest";
import { renewPageMode } from "@/components/renew/renew-selections";

describe("renewPageMode", () => {
  const data = {};
  it("is wizard for quote params, full, or no data", () => {
    expect(renewPageMode({ quoteParams: true, full: false, data })).toBe("wizard");
    expect(renewPageMode({ quoteParams: false, full: true, data })).toBe("wizard");
    expect(renewPageMode({ quoteParams: false, full: false, data: null })).toBe("wizard");
  });
  it("is quick otherwise", () => {
    expect(renewPageMode({ quoteParams: false, full: false, data })).toBe("quick");
  });
});
