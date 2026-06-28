import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { account, auditLog, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { usersService } from "@/lib/services/users.service";

// PIN backs the staff idle-lock, so the mechanics are exercised on a staff user.
const PHONE = "+15550000333";
const CUSTOMER_PHONE = "+15550000334";
const PASSWORD = "correct-horse";

async function seedUser(role: "member" | "user" = "member", phone = PHONE) {
  const [u] = await db
    .insert(users)
    .values({ name: "Pin Tester", phone, role })
    .returning({ id: users.id, publicId: users.publicId });
  await db.insert(account).values({
    accountId: String(u.id),
    providerId: "credential",
    userId: u.id,
    password: await hashPassword(PASSWORD),
  });
  return u;
}

async function cleanup() {
  const rows = await db
    .select({ id: users.id, publicId: users.publicId })
    .from(users)
    .where(inArray(users.phone, [PHONE, CUSTOMER_PHONE]));
  for (const r of rows) {
    await db.delete(auditLog).where(eq(auditLog.entityPublicId, r.publicId));
    await db.delete(account).where(eq(account.userId, r.id));
    await db.delete(users).where(eq(users.id, r.id));
  }
}

describe("UsersService PIN methods", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("setPin rejects a wrong password and writes nothing", async () => {
    const u = await seedUser();
    await expect(usersService.setPin(u.publicId, "wrong", "1357")).rejects.toThrow();
    expect(await usersService.hasPin(u.publicId)).toBe(false);
  });

  it("setPin with the right password sets the PIN; verifyPin confirms it", async () => {
    const u = await seedUser();
    await usersService.setPin(u.publicId, PASSWORD, "1357");
    expect(await usersService.hasPin(u.publicId)).toBe(true);
    expect(await usersService.verifyPin(u.publicId, "1357")).toEqual({ ok: true });
    expect(await usersService.verifyPin(u.publicId, "2468")).toEqual({ ok: false });
  });

  it("forces password after 5 wrong PINs and resets the counter", async () => {
    const u = await seedUser();
    await usersService.setPin(u.publicId, PASSWORD, "1357");
    for (let i = 0; i < 4; i++) {
      expect(await usersService.verifyPin(u.publicId, "0000")).toEqual({ ok: false });
    }
    expect(await usersService.verifyPin(u.publicId, "0000")).toEqual({ ok: false, forcePassword: true });
    const [row] = await db.select({ a: users.pinAttempts }).from(users).where(eq(users.publicId, u.publicId));
    expect(row.a).toBe(0);
  });

  it("counts every concurrent wrong attempt (no lost increments under TOCTOU)", async () => {
    const u = await seedUser();
    await usersService.setPin(u.publicId, PASSWORD, "1357");
    // Four simultaneous wrong PINs; atomic increments must land all four (none
    // reaches the 5-fail reset). Read-then-write would under-count here.
    await Promise.all(Array.from({ length: 4 }, () => usersService.verifyPin(u.publicId, "0000")));
    const [row] = await db.select({ a: users.pinAttempts }).from(users).where(eq(users.publicId, u.publicId));
    expect(row.a).toBe(4);
  });

  it("removePin clears the PIN after a correct password", async () => {
    const u = await seedUser();
    await usersService.setPin(u.publicId, PASSWORD, "1357");
    await expect(usersService.removePin(u.publicId, "wrong")).rejects.toThrow();
    await usersService.removePin(u.publicId, PASSWORD);
    expect(await usersService.hasPin(u.publicId)).toBe(false);
  });

  it("setPin does not write a bcrypt hash to audit_log", async () => {
    const u = await seedUser();
    await usersService.setPin(u.publicId, PASSWORD, "1357");
    const rows = await db.select({ changes: auditLog.changes }).from(auditLog).where(eq(auditLog.entityPublicId, u.publicId));
    expect(JSON.stringify(rows)).not.toMatch(/\$2[aby]\$/);
    for (const row of rows) {
      const ch = row.changes as Record<string, unknown> | null;
      if (ch && "pinHash" in ch) {
        expect(ch.pinHash).toEqual({ from: "[redacted]", to: "[redacted]" });
      }
    }
  });

  it("verifyPin does not write any audit_log rows", async () => {
    const u = await seedUser();
    await usersService.setPin(u.publicId, PASSWORD, "1357");
    const beforeCount = await db.$count(auditLog, eq(auditLog.entityPublicId, u.publicId));
    await usersService.verifyPin(u.publicId, "0000");
    await usersService.verifyPin(u.publicId, "0000");
    await usersService.verifyPin(u.publicId, "0000");
    const afterCount = await db.$count(auditLog, eq(auditLog.entityPublicId, u.publicId));
    expect(afterCount).toBe(beforeCount);
  });

  it("a customer cannot set or remove a PIN even with the right password", async () => {
    const u = await seedUser("user", CUSTOMER_PHONE);
    await expect(usersService.setPin(u.publicId, PASSWORD, "1357")).rejects.toThrow();
    expect(await usersService.hasPin(u.publicId)).toBe(false);
    await expect(usersService.removePin(u.publicId, PASSWORD)).rejects.toThrow();
  });
});
