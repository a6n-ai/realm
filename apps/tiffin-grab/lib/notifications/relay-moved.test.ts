import { afterEach, describe, expect, it } from "vitest";
import { assertCampaignsOnEngine, campaignsMovedResponse } from "@/lib/notifications/relay-moved";

describe("campaigns moved to Relay", () => {
  afterEach(() => {
    delete process.env.EMAIL_VIA_RELAY;
  });

  it("refuses with 409 under the flag and passes through when off", () => {
    process.env.EMAIL_VIA_RELAY = "1";
    expect(campaignsMovedResponse()?.status).toBe(409);
    expect(() => assertCampaignsOnEngine()).toThrow("campaigns moved to Relay");
    delete process.env.EMAIL_VIA_RELAY;
    expect(campaignsMovedResponse()).toBeNull();
    expect(() => assertCampaignsOnEngine()).not.toThrow();
  });
});
