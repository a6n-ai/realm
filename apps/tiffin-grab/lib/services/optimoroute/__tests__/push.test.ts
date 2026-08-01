import { describe, expect, it, vi } from "vitest";
import { normalisePhone } from "../push";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

describe("normalisePhone", () => {
  it("strips the country code the driver app does not dial", () => {
    expect(normalisePhone("+1 647 555 7001")).toBe("6475557001");
    expect(normalisePhone("16475557001")).toBe("6475557001");
    expect(normalisePhone("+91 98765 43210")).toBe("9876543210");
    expect(normalisePhone("(647) 555-7001")).toBe("6475557001");
  });

  it("passes an already-10-digit number through", () => {
    expect(normalisePhone("6475557001")).toBe("6475557001");
  });

  it("does not invent digits for empty or unrecognised input", () => {
    expect(normalisePhone(null)).toBe("");
    expect(normalisePhone("")).toBe("");
    // Too short to be a real number: return what is there rather than pad or guess.
    expect(normalisePhone("555-7001")).toBe("5557001");
  });
});

describe("withConcurrency", () => {
  it("never exceeds the cap OptimoRoute enforces", async () => {
    const { withConcurrency, MAX_CONCURRENCY } = await import("../client");
    expect(MAX_CONCURRENCY).toBeLessThanOrEqual(5);

    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);

    const results = await withConcurrency(items, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return n * 2;
    });

    expect(peak).toBeLessThanOrEqual(MAX_CONCURRENCY);
    // Order must survive the pooling, or results stop lining up with their inputs.
    expect(results).toEqual(items.map((n) => n * 2));
  });

  it("handles fewer items than the cap", async () => {
    const { withConcurrency } = await import("../client");
    expect(await withConcurrency([1, 2], async (n) => n + 1)).toEqual([2, 3]);
    expect(await withConcurrency([], async (n: number) => n)).toEqual([]);
  });
});
