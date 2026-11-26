import { describe, expect, it } from "vitest";
import { planPercentOff } from "@/lib/landing/promos";

describe("planPercentOff", () => {
  it("counts plan discounts only, never the fixed code", () => {
    const r = { subtotal: 531, lines: [{ label: "12-week plan (15%)", amount: 79.65 }, { label: "Mon, Wed, Fri (10%)", amount: 53.1 }, { label: "Code WELCOME10", amount: 25 }] };
    expect(planPercentOff(r)).toBe("25%");
  });
  it("is null when only a code saves", () => {
    expect(planPercentOff({ subtotal: 100, lines: [{ label: "Code X", amount: 10 }] })).toBeNull();
  });
});
