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
    await scheduleCampaignWake(60_001);
    await scheduleSiteRefreshWake(60_001);
    expect(env.CAMPAIGN_WAKE.create).toHaveBeenCalledWith({ id: "wake-120000", params: { at: 60_001 } });
    expect(env.SITE_REFRESH_WAKE.create).toHaveBeenCalledWith({ id: "site-120000", params: { at: 60_001 } });
  });
  it("never throws", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    env.CAMPAIGN_WAKE.create.mockRejectedValueOnce(new Error("boom"));
    await expect(scheduleCampaignWake(1)).resolves.toBeUndefined();
  });
});
