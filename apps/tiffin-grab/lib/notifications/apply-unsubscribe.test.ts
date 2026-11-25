import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@relay/engine", async (orig) => ({ ...(await orig<typeof import("@relay/engine")>()), handleUnsubscribe: vi.fn(async () => {}) }));

import { signUnsubscribeToken } from "@relay/engine";
import { setRelayClientForTests, type RelayClient } from "@/lib/relay/client";
import { applyUnsubscribe } from "./apply-unsubscribe";

const SECRET = "test-unsubscribe-secret-0123456789abcdef";
const suppress = vi.fn(async () => ({ created: true }));

function link(address: string, token: string) {
  const u = new URL("https://app.tiffingrab.ca/api/unsubscribe");
  u.searchParams.set("address", address);
  u.searchParams.set("token", token);
  return u;
}

describe("applyUnsubscribe under EMAIL_VIA_RELAY", () => {
  beforeEach(() => {
    process.env.UNSUBSCRIBE_SECRET = SECRET;
    process.env.EMAIL_VIA_RELAY = "1";
    suppress.mockClear();
    setRelayClientForTests({ suppress } as unknown as RelayClient);
  });
  afterEach(() => {
    delete process.env.EMAIL_VIA_RELAY;
    setRelayClientForTests(null);
  });

  it("tells Relay at once for a valid link, marketing only", async () => {
    await applyUnsubscribe(link("Ana@X.ca", signUnsubscribeToken(SECRET, "Ana@X.ca")), "link");
    expect(suppress).toHaveBeenCalledWith({ email: "ana@x.ca", reason: "unsubscribe", stream: "marketing" });
  });

  it("does not call Relay for a bad token or with the flag off", async () => {
    await applyUnsubscribe(link("ana@x.ca", "bad"), "link");
    delete process.env.EMAIL_VIA_RELAY;
    await applyUnsubscribe(link("ana@x.ca", signUnsubscribeToken(SECRET, "ana@x.ca")), "link");
    expect(suppress).not.toHaveBeenCalled();
  });

  it("still answers applied when Relay is down", async () => {
    suppress.mockRejectedValueOnce(new Error("down"));
    const res = await applyUnsubscribe(link("ana@x.ca", signUnsubscribeToken(SECRET, "ana@x.ca")), "one-click");
    expect(res.applied).toBe(true);
  });
});
