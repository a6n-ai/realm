import { describe, expect, it } from "vitest";

const { withOrderLock } = await import("../order-lock");

describe("withOrderLock", () => {
  it("serializes two writers on the same order and lets different orders run together", async () => {
    const id = 9_000_000_000_001n;
    const events: string[] = [];
    const run = (label: string, order: bigint, ms: number) =>
      withOrderLock(order, async () => {
        events.push(`${label}:in`);
        await new Promise((r) => setTimeout(r, ms));
        events.push(`${label}:out`);
      });
    const a = run("a", id, 150);
    while (!events.includes("a:in")) await new Promise((r) => setTimeout(r, 5));
    await Promise.all([a, run("b", id, 0), run("c", id + 1n, 0)]);
    expect(events.indexOf("b:in")).toBeGreaterThan(events.indexOf("a:out"));
    expect(events.indexOf("c:in")).toBeLessThan(events.indexOf("a:out"));
  });
});
