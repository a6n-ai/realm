import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({ db: {} }));

const { summarizeSuppressions } = await import("@/lib/notifications/logs-query");

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 20);

describe("summarizeSuppressions", () => {
  it("splits by reason across all time, the last 30 days and this month", () => {
    const out = summarizeSuppressions(
      [
        { reason: "unsubscribe", createdAt: now - 2 * DAY },
        { reason: "unsubscribe", createdAt: now - 25 * DAY },
        { reason: "bounce", createdAt: now - 90 * DAY },
        { reason: "weird", createdAt: now - DAY },
      ],
      now,
    );
    expect(out.total).toEqual({ unsubscribe: 2, bounce: 1, complaint: 0, manual: 1 });
    expect(out.last30).toEqual({ unsubscribe: 2, bounce: 0, complaint: 0, manual: 1 });
    expect(out.thisMonth).toEqual({ unsubscribe: 1, bounce: 0, complaint: 0, manual: 1 });
  });
});
