import { beforeEach, describe, expect, it, vi } from "vitest";

const wake = vi.hoisted(() => vi.fn());
const scheduled = vi.hoisted(() => ({ value: null as number | null }));
const pending = vi.hoisted(() => ({ value: null as number | null }));
vi.mock("@/lib/runtime/workflow-wake", () => ({ scheduleCampaignWake: wake }));
vi.mock("@/lib/notifications/drain", () => ({ materializeDue: async () => 2, drainPending: async () => 3 }));
vi.mock("@/lib/notifications/notify-next", () => ({ computeNotifyNextAt: async () => scheduled.value, earliestPendingAt: async () => pending.value }));

import { runTick } from "../tick";

beforeEach(() => {
  wake.mockClear();
  scheduled.value = null;
  pending.value = null;
});

describe("runTick", () => {
  it("schedules nothing when nothing is scheduled or pending", async () => {
    expect(await runTick()).toEqual({ materialized: 2, processed: 3, retryAfterMs: null });
    expect(wake).not.toHaveBeenCalled();
  });

  it("books a follow-up wake while outbox rows are still pending (a campaign bigger than one tick)", async () => {
    pending.value = Date.now() - 1000;
    const r = await runTick();
    expect(wake).toHaveBeenCalledWith(pending.value);
    expect(r.retryAfterMs).toBe(0);
  });

  it("wakes at the earliest of the next scheduled campaign and the earliest pending row", async () => {
    scheduled.value = 9_000_000_000_000;
    pending.value = 8_000_000_000_000;
    await runTick();
    expect(wake).toHaveBeenCalledWith(8_000_000_000_000);
    pending.value = null;
    await runTick();
    expect(wake).toHaveBeenLastCalledWith(9_000_000_000_000);
  });
});
