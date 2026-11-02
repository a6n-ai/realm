import { describe, expect, it } from "vitest";
import { stageLabel, stageVariant } from "../stage-badge";

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

describe("stageLabel", () => {
  it("uses the status-model labels", () => {
    expect(stageLabel("new")).toBe("Lead");
    expect(stageLabel("contacted")).toBe("Responded");
    expect(stageLabel("follow_up")).toBe("Follow-up");
    expect(stageLabel("converted")).toBe("Took plan/trial");
    expect(stageLabel("lost")).toBe("Lost");
  });
  it("labels legacy quoted as Follow-up", () => {
    expect(stageLabel("quoted")).toBe("Follow-up");
  });
});
