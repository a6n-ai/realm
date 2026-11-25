import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("@/lib/runtime/cf-env", () => ({ cfEnv: () => env.current }));

import { relayRpc, setRelayClientForTests } from "./client";

const input = { stream: "transactional" as const, from: "a@x.ca", to: "b@x.ca", subject: "s", html: "h", text: "t" };

describe("relayRpc", () => {
  beforeEach(() => {
    setRelayClientForTests(null);
    env.current = {};
  });

  it("calls the bound RELAY stub with RELAY_API_KEY first", async () => {
    const send = vi.fn().mockResolvedValue({ messageId: "m1", status: "queued", duplicate: false });
    env.current = { RELAY: { send }, RELAY_API_KEY: "k" };
    await expect(relayRpc().send(input)).resolves.toEqual({ messageId: "m1", status: "queued", duplicate: false });
    expect(send).toHaveBeenCalledWith("k", input);
  });

  it("throws when there is no binding and no test client", () => {
    expect(() => relayRpc()).toThrow("relay binding missing");
  });

  it("returns the test client when one is set", () => {
    const fake = { send: vi.fn() } as never;
    setRelayClientForTests(fake);
    expect(relayRpc()).toBe(fake);
  });
});
