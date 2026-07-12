import { describe, expect, it } from "vitest";
import { transitions } from "../tokens";

describe("motion tokens", () => {
  it("exposes a soft spring with the expected shape", () => {
    expect(transitions.springSoft.type).toBe("spring");
    expect(transitions.springSoft.stiffness).toBeGreaterThan(0);
    expect(transitions.springSoft.damping).toBeGreaterThan(0);
  });

  it("exposes eased tweens in seconds with a cubic-bezier array", () => {
    expect(transitions.easeBase.duration).toBeCloseTo(0.25);
    expect(transitions.easeBase.ease).toHaveLength(4);
    expect(transitions.easeSlow.duration).toBeCloseTo(0.4);
  });

  it("exposes a positive stagger step", () => {
    expect(transitions.stagger).toBeGreaterThan(0);
  });
});
