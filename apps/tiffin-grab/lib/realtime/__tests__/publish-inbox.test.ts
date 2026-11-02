import { beforeEach, describe, expect, it, vi } from "vitest";

const publish = vi.fn();
let failWith: Error | null = null;
// Rejection is returned from a plain wrapper: a vi.fn that rejects is reported as unhandled by vitest itself.
vi.mock("@/lib/realtime/bus", () => ({
  realtimeBus: {
    publish: (...a: unknown[]) => {
      publish(...a);
      return failWith ? Promise.reject(failWith) : undefined;
    },
  },
}));

const { publishTicketsInbox, publishPaymentsInbox, publishAnalyticsLive, publishUserRefresh, publishLive } =
  await import("../publish-inbox");

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("publishers use realtimeBus", () => {
  beforeEach(() => {
    publish.mockReset();
    failWith = null;
  });

  it.each([
    ["tickets:inbox", () => publishTicketsInbox()],
    ["payments:inbox", () => publishPaymentsInbox()],
    ["analytics:live", () => publishAnalyticsLive()],
    ["refresh:u1", () => publishUserRefresh("u1")],
  ])("%s", async (channel, fire) => {
    fire();
    await flush();
    expect(publish).toHaveBeenCalledWith(channel, { type: "message", channel });
  });

  it("a failing Worker is logged, never thrown into the caller", async () => {
    const err = new Error("down");
    failWith = err;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => publishLive("ticket:t1", { type: "message", channel: "ticket:t1" })).not.toThrow();
    await vi.waitFor(() => expect(log).toHaveBeenCalledWith("publish ticket:t1", err));
    log.mockRestore();
  });
});
