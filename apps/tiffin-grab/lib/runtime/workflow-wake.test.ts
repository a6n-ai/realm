import { afterEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ CAMPAIGN_WAKE: { create: vi.fn() }, SITE_REFRESH_WAKE: { create: vi.fn() } }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env }) }));

import { scheduleCampaignWake, scheduleSiteRefreshWake } from "./workflow-wake";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("workflow wake helpers", () => {
  it("does nothing off Workers", async () => {
    await scheduleCampaignWake(60_000);
    expect(env.CAMPAIGN_WAKE.create).not.toHaveBeenCalled();
  });
  it("creates wake-<minute> / site-<minute> instances on Workers", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    const at = Date.now() + 3600_000;
    await scheduleCampaignWake(at);
    await scheduleSiteRefreshWake(at);
    const minute = Math.ceil(at / 60_000) * 60_000;
    expect(env.CAMPAIGN_WAKE.create).toHaveBeenCalledWith({ id: `wake-${minute}`, params: { at } });
    expect(env.SITE_REFRESH_WAKE.create).toHaveBeenCalledWith({ id: `site-${minute}`, params: { at } });
  });
  it("never schedules sooner than a minute out", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    const before = Date.now();
    await scheduleCampaignWake(before + 30_000);
    expect(env.CAMPAIGN_WAKE.create.mock.calls[0][0].params.at).toBeGreaterThanOrEqual(before + 60_000);
  });
  it("never throws", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    env.CAMPAIGN_WAKE.create.mockRejectedValueOnce(new Error("boom"));
    await expect(scheduleCampaignWake(1)).resolves.toBeUndefined();
  });
});
