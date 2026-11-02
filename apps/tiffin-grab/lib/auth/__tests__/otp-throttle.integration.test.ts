import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { like } from "drizzle-orm";
import { db } from "@/db/client";
import { otpThrottle } from "@/db/schema";
import { allowOtpTo } from "../otp-throttle";

beforeAll(() => vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" }));
afterAll(() => vi.unstubAllGlobals());
beforeEach(async () => {
  await db.delete(otpThrottle).where(like(otpThrottle.key, "t6-%"));
});

describe("otp caps hold across two calls on the DB path", () => {
  it("caps one IP at 6 and leaves another IP free", async () => {
    for (let i = 0; i < 6; i++) expect(await allowOtpTo("t6-a@target.ca", "6.6.6.6")).toBe(true);
    expect(await allowOtpTo("T6-A@target.ca", "6.6.6.6")).toBe(false);
    expect(await allowOtpTo("t6-a@target.ca", "1.2.3.4")).toBe(true);
  });

  it("caps an address at 30 across IPs, even concurrently", async () => {
    const r = await Promise.all(Array.from({ length: 40 }, (_, i) => allowOtpTo("t6-b@target.ca", `10.0.0.${i}`)));
    expect(r.filter(Boolean)).toHaveLength(30);
  });

  it("refused attempts from one IP do not lock the address", async () => {
    for (let i = 0; i < 6; i++) expect(await allowOtpTo("t6-d@target.ca", "6.6.6.6")).toBe(true);
    for (let i = 0; i < 50; i++) expect(await allowOtpTo("t6-d@target.ca", "6.6.6.6")).toBe(false);
    expect(await allowOtpTo("t6-d@target.ca", "1.2.3.4")).toBe(true);
  });

  it("resets an expired window", async () => {
    for (let i = 0; i < 6; i++) await allowOtpTo("t6-c@target.ca", "6.6.6.6");
    await db.update(otpThrottle).set({ windowStart: 1 }).where(like(otpThrottle.key, "t6-c%"));
    expect(await allowOtpTo("t6-c@target.ca", "6.6.6.6")).toBe(true);
  });
});
