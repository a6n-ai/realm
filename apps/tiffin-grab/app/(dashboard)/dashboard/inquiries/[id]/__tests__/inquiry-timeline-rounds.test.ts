import { describe, expect, it, vi } from "vitest";

vi.mock("../../_leads/status-dialog", () => ({ look: () => ({ icon: () => null, text: "" }) }));
const { titleFor } = await import("../inquiry-timeline");

const base = {
  publicId: "iac_1", note: null, outcome: null, amount: null, nextFollowUpAt: null, fromStage: null, toStage: null,
  fromSubStatus: null, toSubStatus: null, createdAt: 0, actor: { label: "System", kind: "system" as const }, details: null,
};

describe("timeline titles carry the round", () => {
  it("leaves first-sale activities unlabelled and labels renewal rounds", () => {
    expect(titleFor({ ...base, type: "call", orderRank: 1 }, "CAD")).toBe("Call");
    expect(titleFor({ ...base, type: "call", orderRank: 3 }, "CAD")).toBe("Call · Renewal 2");
  });

  it("describes the new activity types", () => {
    expect(titleFor({ ...base, type: "renewal_started", orderRank: 1 }, "CAD")).toBe("Renewal round opened");
    expect(titleFor({ ...base, type: "renewed", orderRank: 2 }, "CAD")).toBe("Renewed with a new plan · Renewal 1");
    expect(titleFor({ ...base, type: "reassigned", orderRank: null }, "CAD")).toBe("Owner changed");
    expect(titleFor({ ...base, type: "stage_change", orderRank: 1, details: { renewalStatusFrom: null, renewalStatusTo: "follow_up" } }, "CAD"))
      .toBe("Renewal: New → Follow up");
  });
});
