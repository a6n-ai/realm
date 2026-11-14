import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const cookieSet = vi.fn();
const cookieDelete = vi.fn();
const jar = { value: undefined as string | undefined };
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: cookieSet, delete: cookieDelete, get: () => (jar.value ? { value: jar.value } : undefined) }),
}));

const { rememberReferralCode } = await import("../actions");

const PHONE = "+16475550131";
beforeAll(async () => {
  await db.delete(users).where(eq(users.phone, PHONE));
  await db.insert(users).values({ phone: PHONE, email: "sub-referrer@test.invalid", role: "user", referralCode: "QRST2345" });
});
afterAll(async () => {
  await db.delete(users).where(eq(users.phone, PHONE));
});
beforeEach(() => {
  cookieSet.mockClear();
  cookieDelete.mockClear();
  jar.value = undefined;
});

describe("rememberReferralCode (subscribe first step)", () => {
  it("remembers a valid code in this browser, however it was typed", async () => {
    expect(await rememberReferralCode(" qrst 2345 ")).toEqual({ ok: true });
    expect(cookieSet).toHaveBeenCalledWith("tg_ref", "QRST2345", expect.objectContaining({ httpOnly: true, maxAge: 2592000 }));
  });

  it("rejects a code the person typed that nobody has", async () => {
    expect(await rememberReferralCode("NOPE2345")).toEqual({ ok: false, error: "That referral code isn't valid" });
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("drops a dead code that only came from the share link, without an error", async () => {
    jar.value = "DEAD2345";
    expect(await rememberReferralCode("DEAD2345")).toEqual({ ok: true });
    expect(cookieDelete).toHaveBeenCalledWith("tg_ref");
  });

  it("does nothing for a blank field", async () => {
    expect(await rememberReferralCode("  ")).toEqual({ ok: true });
    expect(cookieSet).not.toHaveBeenCalled();
  });
});
