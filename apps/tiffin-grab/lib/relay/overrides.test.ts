import { beforeEach, describe, expect, it, vi } from "vitest";
import { setRelayClientForTests, type RelayClient } from "./client";
import { clearTemplateOverrideCache, getTemplateOverrides, overrideKey } from "./overrides";

const row = { event: "payment_received", locale: "en", subject: "S", intro: null, enabled: true };

function fakeClient(templateOverrides: RelayClient["templateOverrides"]): RelayClient {
  return { templateOverrides } as unknown as RelayClient;
}

describe("getTemplateOverrides", () => {
  beforeEach(() => {
    clearTemplateOverrideCache();
    setRelayClientForTests(null);
  });

  it("keys overrides by event and locale and skips rows without an event", async () => {
    setRelayClientForTests(fakeClient(async () => [row, { ...row, event: null }]));
    const map = await getTemplateOverrides();
    expect([...map.keys()]).toEqual([overrideKey("payment_received", "en")]);
  });

  it("returns the cached map inside the 60 s window without calling Relay again", async () => {
    const fn = vi.fn(async () => [row]);
    setRelayClientForTests(fakeClient(fn));
    await getTemplateOverrides();
    await getTemplateOverrides();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("returns the last good map when Relay fails after the window", async () => {
    vi.useFakeTimers();
    try {
      setRelayClientForTests(fakeClient(async () => [row]));
      await getTemplateOverrides();
      vi.advanceTimersByTime(61_000);
      setRelayClientForTests(fakeClient(async () => { throw new Error("relay down"); }));
      expect((await getTemplateOverrides()).has(overrideKey("payment_received", "en"))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns null when Relay fails and nothing was ever read", async () => {
    setRelayClientForTests(fakeClient(async () => { throw new Error("relay down"); }));
    await expect(getTemplateOverrides()).resolves.toBeNull();
  });
});
