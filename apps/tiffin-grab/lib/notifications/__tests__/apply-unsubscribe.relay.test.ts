import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const engine = vi.hoisted(() => ({ handleUnsubscribe: vi.fn(async () => undefined), verifyUnsubscribeToken: vi.fn(() => true) }));
const queued = vi.hoisted(() => vi.fn(async (_row: unknown) => undefined));
const signalOutbox = vi.hoisted(() => vi.fn(async () => undefined));
const campaignRows = vi.hoisted(() => ({ value: [] as { publicId: string; name: string }[] }));
const tx = vi.hoisted(() => ({
  select: () => ({ from: () => ({ where: async () => campaignRows.value }) }),
  insert: () => ({ values: queued }),
}));
vi.mock("@relay/engine", () => engine);
vi.mock("@/db/client", () => ({ db: { transaction: (fn: (t: unknown) => unknown) => fn(tx) } }));
vi.mock("@/lib/notifications/tables", () => ({ notificationTables: {} }));
vi.mock("@/lib/notifications/outbox-signal", () => ({ signalOutbox }));
vi.mock("@/lib/runtime/cf-env", () => ({ cfEnv: () => ({}) }));

import { applyUnsubscribe } from "@/lib/notifications/apply-unsubscribe";
import { setRelayClientForTests, type RelayClient } from "@/lib/relay/client";

const url = new URL("https://app.example.test/unsubscribe?address=Ana%40Example.test&token=t0k&campaignId=7");
const suppress = vi.fn(async () => ({ created: true }));

beforeEach(() => {
  vi.stubEnv("UNSUBSCRIBE_SECRET", "s".repeat(32));
  vi.stubEnv("EMAIL_VIA_RELAY", "1");
  setRelayClientForTests({ suppress } as unknown as RelayClient);
  vi.clearAllMocks();
  engine.verifyUnsubscribeToken.mockReturnValue(true);
  campaignRows.value = [{ publicId: "cmp_abc", name: "Spring" }];
});

afterEach(() => {
  setRelayClientForTests(null);
  vi.unstubAllEnvs();
});

describe("applyUnsubscribe", () => {
  it("writes the engine suppression and queues the event in the same transaction, without calling Relay", async () => {
    expect(await applyUnsubscribe(url, "link")).toEqual({ applied: true, address: "Ana@Example.test" });
    expect(engine.handleUnsubscribe).toHaveBeenCalledWith(tx, {}, expect.objectContaining({ campaignId: 7n, source: "link" }));
    expect(queued).toHaveBeenCalledWith({
      email: "ana@example.test",
      reason: "unsubscribe",
      stream: "marketing",
      source: "link",
      campaignRef: "cmp_abc",
      campaignName: "Spring",
      createdAt: expect.any(Number),
    });
    expect(signalOutbox).toHaveBeenCalledTimes(1);
    expect(suppress).not.toHaveBeenCalled();
  });

  it("queues with no campaign when the link names none or an unknown one", async () => {
    campaignRows.value = [];
    await applyUnsubscribe(url, "one-click");
    expect(queued).toHaveBeenCalledWith(expect.objectContaining({ source: "one-click", campaignRef: null, campaignName: null }));
  });

  it("queues nothing for a token that does not verify, and answers the same page", async () => {
    engine.verifyUnsubscribeToken.mockReturnValue(false);
    expect(await applyUnsubscribe(url, "one-click")).toEqual({ applied: false, address: null });
    expect(queued).not.toHaveBeenCalled();
    expect(signalOutbox).not.toHaveBeenCalled();
  });

  // Events from before the flag flips must still reach Relay.
  it("queues with the flag off too", async () => {
    vi.stubEnv("EMAIL_VIA_RELAY", "");
    await applyUnsubscribe(url, "link");
    expect(engine.handleUnsubscribe).toHaveBeenCalledTimes(1);
    expect(queued).toHaveBeenCalledTimes(1);
  });
});
