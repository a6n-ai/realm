import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

const calls = vi.hoisted(() => [] as string[]);
const pushBlocks = vi.hoisted(() => vi.fn());
const handleResubscribe = vi.hoisted(() => vi.fn());
const campaignConfig = vi.hoisted(() => vi.fn());
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/relay/blocks", () => ({ pushBlocks }));
vi.mock("@/lib/notifications/campaign-config", () => ({ campaignConfig }));
vi.mock("@relay/engine", async (original) => ({ ...(await original<typeof import("@relay/engine")>()), handleResubscribe }));

const { confirmResubscribe } = await import("@/app/(public)/resubscribe/actions");
const { setRelayClientForTests } = await import("@/lib/relay/client");

import type { RelayClient } from "@/lib/relay/client";

const SECRET = "resubscribe-test-secret";
const ADDRESS = "Back@Example.test";
const TOKEN = createHmac("sha256", SECRET).update("resubscribe:back@example.test").digest("hex");
const resubscribe = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  calls.length = 0;
  pushBlocks.mockImplementation(async () => (calls.push("push"), { pushed: 0, pending: false }));
  resubscribe.mockImplementation(async () => (calls.push("relay"), { removed: true }));
  handleResubscribe.mockImplementation(async () => (calls.push("local"), true));
  campaignConfig.mockResolvedValue({ sender: { email: "news@example.test" } });
  setRelayClientForTests({ resubscribe } as unknown as RelayClient);
  vi.stubEnv("UNSUBSCRIBE_SECRET", SECRET);
  vi.stubEnv("EMAIL_VIA_RELAY", "1");
});

afterEach(() => {
  setRelayClientForTests(null);
  vi.unstubAllEnvs();
});

describe("confirmResubscribe", () => {
  it("rejects a bad token without touching Relay or the local table", async () => {
    expect(await confirmResubscribe(ADDRESS, "00")).toBe("invalid");
    expect(calls).toEqual([]);
  });

  it("pushes pending blocks, tells Relay, then updates the local table", async () => {
    expect(await confirmResubscribe(ADDRESS, TOKEN)).toBe("done");
    expect(calls).toEqual(["push", "relay", "local"]);
    expect(resubscribe).toHaveBeenCalledWith({ email: "back@example.test", from: "news@example.test" });
  });

  it("changes nothing while blocks are still queued", async () => {
    pushBlocks.mockResolvedValue({ pushed: 0, pending: true });
    expect(await confirmResubscribe(ADDRESS, TOKEN)).toBe("unavailable");
    expect(resubscribe).not.toHaveBeenCalled();
    expect(handleResubscribe).not.toHaveBeenCalled();
  });

  it("changes nothing locally when Relay refuses", async () => {
    resubscribe.mockRejectedValue(new Error("down"));
    expect(await confirmResubscribe(ADDRESS, TOKEN)).toBe("unavailable");
    expect(handleResubscribe).not.toHaveBeenCalled();
  });

  it("only updates the local table when the flag is off", async () => {
    vi.stubEnv("EMAIL_VIA_RELAY", "");
    expect(await confirmResubscribe(ADDRESS, TOKEN)).toBe("done");
    expect(calls).toEqual(["local"]);
  });
});
