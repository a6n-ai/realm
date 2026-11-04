import { describe, expect, it, vi } from "vitest";
import { consume, retryDelaySeconds } from "./queue-consumer.js";

const batch = () => ({ messages: [{ ack: vi.fn(), retry: vi.fn() }, { ack: vi.fn(), retry: vi.fn() }] });

describe("consume", () => {
  it("acks every message when nothing is left pending (sent, or already sent elsewhere)", async () => {
    const b = batch();
    await consume(b, async () => ({ ok: true, retryAfterMs: null }));
    for (const m of b.messages) {
      expect(m.ack).toHaveBeenCalled();
      expect(m.retry).not.toHaveBeenCalled();
    }
  });

  it("retries with the row's backoff delay when a row is still pending", async () => {
    const b = batch();
    await consume(b, async () => ({ ok: true, retryAfterMs: 90_000 }));
    for (const m of b.messages) {
      expect(m.retry).toHaveBeenCalledWith({ delaySeconds: 90 });
      expect(m.ack).not.toHaveBeenCalled();
    }
  });

  it("retries when the tick fails or throws", async () => {
    for (const run of [async () => ({ ok: false, retryAfterMs: 0 }), async () => Promise.reject(new Error("x"))]) {
      const b = batch();
      vi.spyOn(console, "error").mockImplementation(() => {});
      await consume(b, run);
      expect(b.messages[0].retry).toHaveBeenCalledWith({ delaySeconds: 30 });
    }
  });
});

describe("retryDelaySeconds", () => {
  it("clamps to [30, 43200]", () => {
    expect(retryDelaySeconds(0)).toBe(30);
    expect(retryDelaySeconds(null)).toBe(30);
    expect(retryDelaySeconds(100_000)).toBe(100);
    expect(retryDelaySeconds(10 * 86400_000)).toBe(43200);
  });
});
