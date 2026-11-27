import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const wake = vi.hoisted(() => vi.fn());
const scheduled = vi.hoisted(() => ({ value: null as number | null }));
const pending = vi.hoisted(() => ({ value: null as number | null }));
const forward = vi.hoisted(() => vi.fn(async () => ({ retryAfterMs: null as number | null })));
const pushBlocks = vi.hoisted(() => vi.fn(async () => ({ pushed: 0, pending: false })));
vi.mock("@/lib/relay/forward", () => ({ forwardRelayOutbox: forward }));
vi.mock("@/lib/relay/blocks", () => ({ pushBlocks }));
vi.mock("@/lib/runtime/workflow-wake", () => ({ scheduleCampaignWake: wake }));
vi.mock("@/lib/notifications/drain", () => ({ materializeDue: async () => 2, drainPending: async () => 3 }));
vi.mock("@/lib/notifications/notify-next", () => ({ computeNotifyNextAt: async () => scheduled.value, earliestPendingAt: async () => pending.value }));

import { runTick } from "../tick";

beforeEach(() => {
  wake.mockClear();
  forward.mockClear();
  pushBlocks.mockClear();
  scheduled.value = null;
  pending.value = null;
});

afterEach(() => vi.unstubAllEnvs());

describe("runTick", () => {
  it("pushes queued blocks after the mail, and wakes within a minute while some are left", async () => {
    vi.stubEnv("EMAIL_VIA_RELAY", "1");
    pushBlocks.mockResolvedValueOnce({ pushed: 0, pending: true });
    scheduled.value = 9_000_000_000_000;
    const before = Date.now();
    const r = await runTick();
    expect(forward.mock.invocationCallOrder[0]).toBeLessThan(pushBlocks.mock.invocationCallOrder[0]!);
    const at = wake.mock.calls[0]![0] as number;
    expect(at).toBeGreaterThanOrEqual(before + 60_000);
    expect(at).toBeLessThanOrEqual(Date.now() + 60_000);
    expect(r.retryAfterMs).toBeGreaterThan(0);
    expect(r.retryAfterMs).toBeLessThanOrEqual(60_000);
  });

  it("leaves the block queue alone with the Relay flag off", async () => {
    vi.stubEnv("EMAIL_VIA_RELAY", "");
    await runTick();
    expect(pushBlocks).not.toHaveBeenCalled();
  });

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
