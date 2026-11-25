import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const engine = vi.hoisted(() => ({ handleUnsubscribe: vi.fn(async () => undefined), verifyUnsubscribeToken: vi.fn(() => true) }));
vi.mock("@relay/engine", () => engine);
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/notifications/tables", () => ({ notificationTables: {} }));
vi.mock("@/lib/runtime/cf-env", () => ({ cfEnv: () => ({}) }));

import { applyUnsubscribe } from "@/lib/notifications/apply-unsubscribe";
import { setRelayClientForTests, type RelayClient } from "@/lib/relay/client";

const url = new URL("https://app.example.test/unsubscribe?address=Ana%40Example.test&token=t0k&campaignId=7");
const suppress = vi.fn(async () => ({ created: true }));

beforeEach(() => {
  vi.stubEnv("UNSUBSCRIBE_SECRET", "s".repeat(32));
  setRelayClientForTests({ suppress } as unknown as RelayClient);
  suppress.mockClear();
  engine.handleUnsubscribe.mockClear();
  engine.verifyUnsubscribeToken.mockReturnValue(true);
});

afterEach(() => {
  setRelayClientForTests(null);
  vi.unstubAllEnvs();
});

describe("applyUnsubscribe under EMAIL_VIA_RELAY", () => {
  it("suppresses once in Relay for a valid token and answers the same page", async () => {
    vi.stubEnv("EMAIL_VIA_RELAY", "1");
    expect(await applyUnsubscribe(url, "link")).toEqual({ applied: true, address: "Ana@Example.test" });
    expect(suppress).toHaveBeenCalledTimes(1);
    expect(suppress).toHaveBeenCalledWith({ email: "ana@example.test", reason: "unsubscribe", stream: "marketing" });
    expect(engine.handleUnsubscribe).not.toHaveBeenCalled();
  });

  it("does not suppress for a token that does not verify", async () => {
    vi.stubEnv("EMAIL_VIA_RELAY", "1");
    engine.verifyUnsubscribeToken.mockReturnValue(false);
    expect(await applyUnsubscribe(url, "one-click")).toEqual({ applied: false, address: null });
    expect(suppress).not.toHaveBeenCalled();
  });

  it("keeps the engine write when the flag is off", async () => {
    expect(await applyUnsubscribe(url, "link")).toEqual({ applied: true, address: "Ana@Example.test" });
    expect(engine.handleUnsubscribe).toHaveBeenCalledTimes(1);
    expect(suppress).not.toHaveBeenCalled();
  });
});
