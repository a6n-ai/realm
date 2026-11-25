import { beforeEach, describe, expect, it, vi } from "vitest";
import { setRelayClientForTests, type RelayClient } from "@/lib/relay/client";
import { suppressInput, syncSuppressionsToRelay } from "@/lib/relay/suppression-sync";

const state = vi.hoisted(() => ({ rows: [] as unknown[], cursor: null as string | null }));
vi.mock("@/db/client", () => ({ db: { execute: vi.fn(async () => state.rows) } }));
vi.mock("@/lib/runtime/lease", () => ({
  readLeaseValue: vi.fn(async () => state.cursor),
  writeLeaseValue: vi.fn(async (_key: string, value: string) => {
    state.cursor = value;
  }),
}));

function fakeRelay(failOn?: string, error = "relay down"): { client: RelayClient; calls: unknown[] } {
  const calls: unknown[] = [];
  const client = {
    suppress: vi.fn(async (input: { email: string }) => {
      if (input.email === failOn) throw new Error(error);
      calls.push(input);
      return { created: true };
    }),
  } as unknown as RelayClient;
  return { client, calls };
}

describe("suppressInput", () => {
  it("maps marketing scope to the marketing stream, scope all to no stream, and bounces and complaints to manual", () => {
    expect(suppressInput({ address: "A@X.ca", scope: "marketing", reason: "unsubscribe" })).toEqual({
      email: "a@x.ca",
      reason: "unsubscribe",
      stream: "marketing",
    });
    expect(suppressInput({ address: "b@x.ca", scope: "all", reason: "SES hard bounce" })).toEqual({ email: "b@x.ca", reason: "manual", stream: null });
    expect(suppressInput({ address: "c@x.ca", scope: "all", reason: "SES complaint" })).toMatchObject({ reason: "manual" });
  });
});

describe("syncSuppressionsToRelay", () => {
  beforeEach(() => {
    state.cursor = null;
    state.rows = [];
  });

  it("advances the cursor to the last row when every push succeeds", async () => {
    state.rows = [
      { created_at: 100, address: "a@x.ca", scope: "all", reason: "unsubscribe" },
      { created_at: 200, address: "b@x.ca", scope: "all", reason: "unsubscribe" },
    ];
    const { client, calls } = fakeRelay();
    setRelayClientForTests(client);
    expect(await syncSuppressionsToRelay()).toEqual({ pushed: 2 });
    expect(calls).toHaveLength(2);
    expect(state.cursor).toBe("200");
    setRelayClientForTests(null);
  });

  it("stops at the first failure and keeps the cursor at the last accepted row", async () => {
    state.rows = [
      { created_at: 100, address: "a@x.ca", scope: "all", reason: "unsubscribe" },
      { created_at: 200, address: "b@x.ca", scope: "all", reason: "unsubscribe" },
      { created_at: 300, address: "c@x.ca", scope: "all", reason: "unsubscribe" },
    ];
    const { client, calls } = fakeRelay("b@x.ca");
    setRelayClientForTests(client);
    expect(await syncSuppressionsToRelay()).toEqual({ pushed: 1 });
    expect(calls).toEqual([{ email: "a@x.ca", reason: "unsubscribe", stream: null }]);
    expect(state.cursor).toBe("100");
    setRelayClientForTests(null);
  });

  it("skips a row Relay rejects as invalid input, so later opt-outs still sync", async () => {
    state.cursor = null;
    state.rows = [
      { created_at: 100, address: "a@x.ca", scope: "all", reason: "unsubscribe" },
      { created_at: 200, address: "not-an-email", scope: "all", reason: "unsubscribe" },
      { created_at: 300, address: "c@x.ca", scope: "marketing", reason: "unsubscribe" },
    ];
    const { client, calls } = fakeRelay("not-an-email", "invalid input");
    setRelayClientForTests(client);
    expect(await syncSuppressionsToRelay()).toEqual({ pushed: 2 });
    expect(calls).toHaveLength(2);
    expect(state.cursor).toBe("300");
    setRelayClientForTests(null);
  });
});
