import { afterEach, describe, expect, it, vi } from "vitest";
import { setRelayClientForTests, type RelayClient } from "./client";
import { relayOptOutRefusal } from "./campaign-optout";

const row = { channel: "email", kind: "marketing", recipientId: null, recipientEmail: "a@x.ca" };
const loadEmail = vi.fn(async () => "user@x.ca");
const from = "news@x.ca";

function relay(answer: () => Promise<boolean>) {
  vi.stubEnv("EMAIL_VIA_RELAY", "1");
  const isSuppressed = vi.fn(answer);
  setRelayClientForTests({ isSuppressed } as unknown as RelayClient);
  return isSuppressed;
}

afterEach(() => {
  setRelayClientForTests(null);
  vi.unstubAllEnvs();
});

describe("relayOptOutRefusal", () => {
  it("refuses marketing mail to an address Relay has suppressed", async () => {
    const isSuppressed = relay(async () => true);
    expect(await relayOptOutRefusal(row, from, loadEmail)).toBe("recipient opted out or is blocked in Relay");
    expect(isSuppressed).toHaveBeenCalledWith("a@x.ca", "marketing", from);
  });

  it("looks up the user's address when the row has none, and lets a clear one send", async () => {
    const isSuppressed = relay(async () => false);
    expect(await relayOptOutRefusal({ ...row, recipientEmail: null, recipientId: 7n }, from, loadEmail)).toBeNull();
    expect(isSuppressed).toHaveBeenCalledWith("user@x.ca", "marketing", from);
  });

  it("throws when Relay cannot answer, so the row retries instead of sending", async () => {
    relay(async () => {
      throw new Error("relay down");
    });
    await expect(relayOptOutRefusal(row, from, loadEmail)).rejects.toThrow("relay down");
  });

  it("asks nothing for transactional mail, or with the flag off", async () => {
    const isSuppressed = relay(async () => true);
    expect(await relayOptOutRefusal({ ...row, kind: "transactional" }, from, loadEmail)).toBeNull();
    vi.unstubAllEnvs();
    expect(await relayOptOutRefusal(row, from, loadEmail)).toBeNull();
    expect(isSuppressed).not.toHaveBeenCalled();
  });
});
