import { describe, expect, it, vi } from "vitest";
import { drainLoop } from "../notify-drainer";

describe("drainLoop", () => {
  it("keeps looping after a drain throws", async () => {
    const controller = new AbortController();
    let calls = 0;
    const drain = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("transient database blip");
      if (calls >= 3) controller.abort();
      return 0;
    });

    await drainLoop({ intervalMs: 0, signal: controller.signal, drain });
    expect(calls).toBeGreaterThanOrEqual(3);
  });

  it("stops when the signal aborts", async () => {
    const controller = new AbortController();
    controller.abort();
    const drain = vi.fn(async () => 0);
    await drainLoop({ intervalMs: 0, signal: controller.signal, drain });
    expect(drain).not.toHaveBeenCalled();
  });
});

describe("drainLoop campaign materialization", () => {
  it("materializes due campaigns before draining", async () => {
    const controller = new AbortController();
    const order: string[] = [];
    const materialize = vi.fn(async () => {
      order.push("materialize");
      return 0;
    });
    const drain = vi.fn(async () => {
      order.push("drain");
      controller.abort();
      return 0;
    });

    await drainLoop({ intervalMs: 0, signal: controller.signal, drain, materialize });
    expect(order).toEqual(["materialize", "drain"]);
  });

  it("still drains when campaign materialization throws", async () => {
    const controller = new AbortController();
    const materialize = vi.fn(async () => {
      throw new Error("segment query blew up");
    });
    const drain = vi.fn(async () => {
      controller.abort();
      return 0;
    });

    await drainLoop({ intervalMs: 0, signal: controller.signal, drain, materialize });
    expect(drain).toHaveBeenCalled();
  });
});
