import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { phoneVerification } from "@/db/schema";
import { MAX_ATTEMPTS, confirmVerification, startVerification } from "@/lib/notifications/phone-verify";

const PHONE = "+14165550199";
const send = vi.fn(async () => ({ providerMessageId: "sm_test" }));

afterEach(async () => {
  await db.delete(phoneVerification).where(eq(phoneVerification.phone, PHONE));
  send.mockClear();
});

describe("phone verification", () => {
  it("stores a hash, never the plaintext code", async () => {
    const { code } = await startVerification(PHONE, { send });
    const [row] = await db.select().from(phoneVerification).where(eq(phoneVerification.phone, PHONE));
    expect(row.codeHash).not.toContain(code!);
    expect(row.codeHash).toHaveLength(64);
  });

  it("confirms a correct code once", async () => {
    const { code } = await startVerification(PHONE, { send });
    expect(await confirmVerification(PHONE, code!)).toBe(true);
    expect(await confirmVerification(PHONE, code!)).toBe(false);
  });

  it("rejects a wrong code", async () => {
    await startVerification(PHONE, { send });
    expect(await confirmVerification(PHONE, "000000")).toBe(false);
  });

  it("locks out after too many attempts", async () => {
    const { code } = await startVerification(PHONE, { send });
    for (let i = 0; i < MAX_ATTEMPTS; i++) await confirmVerification(PHONE, "000000");
    expect(await confirmVerification(PHONE, code!)).toBe(false);
  });

  it("rejects an expired code", async () => {
    const { code } = await startVerification(PHONE, { send });
    await db
      .update(phoneVerification)
      .set({ expiresAt: Date.now() - 1 })
      .where(eq(phoneVerification.phone, PHONE));
    expect(await confirmVerification(PHONE, code!)).toBe(false);
  });

  it("refuses a number that is not valid E.164", async () => {
    await expect(startVerification("nonsense", { send })).resolves.toEqual({
      sent: false,
      code: null,
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("normalizes the number before storing and confirming", async () => {
    const { code } = await startVerification("(416) 555-0199", { send });
    const [row] = await db.select().from(phoneVerification).where(eq(phoneVerification.phone, PHONE));
    expect(row).toBeTruthy();
    expect(await confirmVerification("416.555.0199", code!)).toBe(true);
  });
});
