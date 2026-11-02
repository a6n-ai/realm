import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("../config", () => ({ getMetaPixelConfig: vi.fn(), openAccessToken: vi.fn() }));

import { buildServerEvent } from "../capi";
import { pixelScript } from "../script";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

describe("buildServerEvent", () => {
  it("normalizes and hashes PII, leaves browser signals raw", () => {
    const e = buildServerEvent({
      eventName: "Lead",
      eventId: "lead:abc",
      eventTimeMs: 1_700_000_000_999,
      user: {
        email: "  Priya@Example.COM ",
        phone: "+1 (416) 555-0100",
        fullName: " Priya  Kaur Singh ",
        ip: "1.2.3.4",
        userAgent: "UA",
        fbp: "fb.1.1.2",
      },
    });
    expect(e.event_time).toBe(1_700_000_000);
    expect(e.user_data.em).toEqual([sha("priya@example.com")]);
    expect(e.user_data.ph).toEqual([sha("14165550100")]);
    expect(e.user_data.fn).toEqual([sha("priya")]);
    expect(e.user_data.ln).toEqual([sha("singh")]);
    expect(e.user_data.client_ip_address).toBe("1.2.3.4");
    expect(e.user_data.fbp).toBe("fb.1.1.2");
    expect(e.action_source).toBe("website");
  });

  it("sends no-browser events as system_generated with nothing empty hashed", () => {
    const e = buildServerEvent({ eventName: "Purchase", eventId: "p", user: { email: "a@b.co", fullName: "Cher" } });
    expect(e.action_source).toBe("system_generated");
    expect(e.user_data.ln).toBeUndefined();
    expect(e.user_data.ph).toBeUndefined();
  });
});

describe("pixelScript", () => {
  it("only interpolates a digits-only pixel ID", () => {
    expect(pixelScript(null)).toBe("");
    expect(pixelScript('1");alert(1)//')).toBe("");
    expect(pixelScript("123456789")).toContain('fbq("init","123456789")');
  });
});

describe("normalizePixelId", () => {
  it("pulls the ID out of pasted text with invisible marks or a label", async () => {
    const { normalizePixelId } = await import("../pixel-id");
    expect(normalizePixelId("1234567890123456")).toBe("1234567890123456");
    expect(normalizePixelId("‎1234567890123456‏ ")).toBe("1234567890123456");
    expect(normalizePixelId("Pixel ID: 1234567890123456")).toBe("1234567890123456");
    expect(normalizePixelId("123 456")).toBeNull();
    expect(normalizePixelId("EAAB-not-an-id")).toBeNull();
  });
});
