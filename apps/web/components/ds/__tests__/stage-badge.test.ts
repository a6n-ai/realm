import { describe, expect, it } from "vitest";
import { stageVariant } from "../stage-badge";

describe("stageVariant", () => {
  it("maps stages to semantic variants", () => {
    expect(stageVariant("new")).toBe("ok");
    expect(stageVariant("follow_up")).toBe("warn");
    expect(stageVariant("lost")).toBe("bad");
    expect(stageVariant("contacted")).toBe("neutral");
    expect(stageVariant("converted")).toBe("ok");
  });
  it("falls back to neutral for unknown", () => {
    expect(stageVariant("zzz")).toBe("neutral");
  });
});
