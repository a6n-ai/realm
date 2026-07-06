import { describe, it, expect } from "vitest";
import { nextAction } from "./next-action";

describe("nextAction", () => {
  it("new → log a call", () => {
    expect(nextAction("new")).toEqual({ label: "Log a call", action: { kind: "activity", activity: "call" } });
  });
  it("contacted → share a quote", () => {
    expect(nextAction("contacted")).toEqual({ label: "Share a quote", action: { kind: "activity", activity: "quote_sent" } });
  });
  it("quoted → follow up", () => {
    expect(nextAction("quoted")).toEqual({ label: "Follow up on the quote", action: { kind: "stage", to: "follow_up" } });
  });
  it("follow_up → convert", () => {
    expect(nextAction("follow_up")).toEqual({ label: "Convert to order", action: { kind: "convert" } });
  });
  it("converted → view order", () => {
    expect(nextAction("converted")).toEqual({ label: "View order", action: { kind: "view_order" } });
  });
  it("lost → reopen", () => {
    expect(nextAction("lost")).toEqual({ label: "Reopen", action: { kind: "stage", to: "new" } });
  });
});
