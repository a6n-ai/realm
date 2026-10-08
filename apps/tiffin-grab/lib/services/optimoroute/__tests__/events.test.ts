import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { inWindow, handleEvents } = await import("../events");

describe("inWindow", () => {
  const w = { start: "07:00", end: "23:00" };
  it("uses the app timezone, not UTC", () => {
    // 2026-10-08 11:30 UTC = 07:30 America/Toronto (EDT)
    expect(inWindow(Date.UTC(2026, 9, 8, 11, 30), "America/Toronto", w)).toBe(true);
    // 2026-10-08 10:30 UTC = 06:30 Toronto
    expect(inWindow(Date.UTC(2026, 9, 8, 10, 30), "America/Toronto", w)).toBe(false);
    // 2026-10-09 03:30 UTC = 23:30 Toronto
    expect(inWindow(Date.UTC(2026, 9, 9, 3, 30), "America/Toronto", w)).toBe(false);
  });
});

describe("handleEvents", () => {
  const row = (publicId: string) => ({ delivery: { id: 1n, publicId }, order: { fullName: "A" } }) as never;
  let apply: ReturnType<typeof vi.fn>;
  let deps: Parameters<typeof handleEvents>[1];

  beforeEach(() => {
    apply = vi.fn(async () => ({ kind: "outcome" }));
    deps = {
      loadRows: vi.fn(async (publicIds: string[]) => publicIds.filter((p) => p.startsWith("dlv_")).map(row)),
      completionsFor: vi.fn(async () => new Map([["oid1", { status: "success" as const }]])),
      moved: vi.fn(async () => new Set<bigint>()),
      apply,
    } as never;
  });

  it("applies success/failed for our deliveries and ignores the other business", async () => {
    const r = await handleEvents(
      [
        { event: "success", unixTimestamp: 1, orderNo: "dlv_A", orderId: "oid1" },
        { event: "success", unixTimestamp: 2, orderNo: "OTHER-9", orderId: "oid9" },
        { event: "on_duty", unixTimestamp: 3 },
      ],
      deps,
    );
    expect(apply).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ applied: 1, ignored: 2 });
  });

  it("a replayed event goes through applyCompletion again, which leaves settled rows (idempotent)", async () => {
    apply.mockResolvedValueOnce({ kind: "outcome" }).mockResolvedValueOnce({ kind: "leave", reason: "Already confirmed delivered" });
    const ev = { event: "success", unixTimestamp: 1, orderNo: "dlv_A", orderId: "oid1" };
    expect(await handleEvents([ev], deps)).toEqual({ applied: 1, ignored: 0 });
    expect(await handleEvents([ev], deps)).toEqual({ applied: 0, ignored: 1 });
  });
});
