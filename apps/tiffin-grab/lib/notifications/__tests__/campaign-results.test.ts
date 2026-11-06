import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  row: undefined as unknown,
  set: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => (h.row ? [h.row] : []) }) }),
    update: () => ({ set: (v: unknown) => (h.set(v), { where: async () => undefined }) }),
  },
}));

import { mergeCounts, refreshCampaignResults } from "../campaign-results";

const SENT = new Date("2026-03-10T15:30:00Z");

describe("campaign results from the metrics provider", () => {
  beforeEach(() => {
    h.set.mockReset();
    h.row = { id: 42, sentAt: SENT, counts: { delivered: 1, bounced: 4 } };
  });

  it("asks for String(id) from the day before the send and merges without lowering", async () => {
    const campaignTotals = vi.fn(async () => ({ delivered: 5, opened: 2 }));
    const out = await refreshCampaignResults("pub", { campaignTotals });

    expect(campaignTotals).toHaveBeenCalledOnce();
    const [id, range] = campaignTotals.mock.calls[0] as unknown as [string, { start: Date; end: Date }];
    expect(id).toBe("42");
    expect(range.start.toISOString()).toBe("2026-03-09T00:00:00.000Z");
    expect(range.end.getTime()).toBeGreaterThan(SENT.getTime());
    expect(out?.counts).toEqual({ delivered: 5, bounced: 4, opened: 2 });
    expect(h.set).toHaveBeenCalledOnce();
  });

  it("keeps a higher webhook count over a lower provider total", async () => {
    h.row = { id: 42, sentAt: SENT, counts: { delivered: 120 } };
    const out = await refreshCampaignResults("pub", { campaignTotals: async () => ({ delivered: 5 }) });
    expect(out?.counts.delivered).toBe(120);
  });

  it("skips the provider for an unsent campaign", async () => {
    h.row = { id: 42, sentAt: null, counts: { queued: 3 } };
    const campaignTotals = vi.fn();
    expect(await refreshCampaignResults("pub", { campaignTotals })).toEqual({ counts: { queued: 3 } });
    expect(campaignTotals).not.toHaveBeenCalled();
  });
});

describe("mergeCounts", () => {
  it("never lowers a count the old webhook recorded, and keeps other keys", () => {
    expect(mergeCounts({ queued: 9325, delivered: 120, bounced: 4 }, { delivered: 80, opened: 30 })).toEqual({
      queued: 9325,
      delivered: 120,
      bounced: 4,
      opened: 30,
    });
  });
});
