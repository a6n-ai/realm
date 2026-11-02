import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => null }));

const { rankTodayItems } = await import("../today.service");
const { waitingLabel } = await import("@/lib/today/types");

const item = (key: string, urgency: 1 | 2 | 3, since: number) =>
  ({ kind: "inquiry", key, who: key, what: "", since, urgency, href: "/" }) as const;

describe("rankTodayItems", () => {
  it("orders by urgency, then longest waiting, then key", () => {
    const ranked = rankTodayItems([
      item("c", 3, 10),
      item("b2", 2, 50),
      item("a", 1, 99),
      item("b1", 2, 5),
      item("d", 2, 50),
    ]);
    expect(ranked.map((i) => i.key)).toEqual(["a", "b1", "b2", "d", "c"]);
  });

  it("does not mutate its input", () => {
    const input = [item("z", 3, 1), item("y", 1, 1)];
    rankTodayItems(input);
    expect(input.map((i) => i.key)).toEqual(["z", "y"]);
  });
});

describe("waitingLabel", () => {
  const now = Date.parse("2026-11-01T12:00:00Z");
  it("reads past, near and future times against the supplied now", () => {
    expect(waitingLabel(now - 5 * 60_000, now)).toBe("5m ago");
    expect(waitingLabel(now - 3 * 3_600_000, now)).toBe("3h ago");
    expect(waitingLabel(now - 4 * 864e5, now)).toBe("4d ago");
    expect(waitingLabel(now + 2 * 864e5, now)).toBe("in 2d");
  });
});
