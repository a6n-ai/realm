import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, or } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { users, account } = await import("@/db/schema");
const { verifyPassword } = await import("@/lib/auth/password");
const { createCustomer } = await import("../customers.service");
const { usersService } = await import("../users.service");

const PHONES = ["+16475550101", "+16475550102", "+16475550103", "+16475550104"];
const EMAILS = ["rep@example.com"];

// Scope cleanup to only the identifiers this file creates — the shared DB holds
// other rows (inquiries etc.) that FK-reference users. account cascades on the
// user delete (account.user_id ON DELETE CASCADE).
async function reset() {
  await db.delete(users).where(or(inArray(users.phone, PHONES), inArray(users.email, EMAILS)));
}

async function rowByPublicId(publicId: string) {
  const [u] = await db.select().from(users).where(eq(users.publicId, publicId)).limit(1);
  return u;
}

async function credentialPassword(userId: bigint) {
  const [a] = await db
    .select({ password: account.password })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .limit(1);
  return a?.password ?? null;
}

describe("first-login password flow (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("provisions a customer with NO password at all", async () => {
    const { publicId } = await createCustomer(
      { fullName: "New Cust", phone: "+16475550101" },
      { actorId: null },
    );
    const row = await rowByPublicId(publicId);
    expect(await credentialPassword(row.id)).toBeNull();
    expect(await usersService.hasPassword(publicId)).toBe(false);
  });

  it("setOwnPassword writes the credential and marks the password set", async () => {
    const { publicId } = await createCustomer(
      { fullName: "Setter", phone: "+16475550102" },
      { actorId: null },
    );
    await usersService.setOwnPassword(publicId, "my-real-pass9");
    const row = await rowByPublicId(publicId);
    expect(row.passwordSet).toBe(true);
    const hash = await credentialPassword(row.id);
    expect(await verifyPassword("my-real-pass9", hash!)).toBe(true);
    expect(await usersService.hasPassword(publicId)).toBe(true);
  });

  // No current-password prompt on this path, so a second call would be a
  // session-theft takeover. It must refuse once a password exists.
  it("setOwnPassword refuses to overwrite an existing password", async () => {
    const { publicId } = await createCustomer(
      { fullName: "Twice", phone: "+16475550103" },
      { actorId: null },
    );
    await usersService.setOwnPassword(publicId, "first-pass99");
    await expect(usersService.setOwnPassword(publicId, "attacker-pass9")).rejects.toThrow();
    const row = await rowByPublicId(publicId);
    expect(await verifyPassword("first-pass99", (await credentialPassword(row.id))!)).toBe(true);
  });

  it("admin reset resolves a staff email and never touches the credential", async () => {
    const staff = await usersService.create({ email: "rep@example.com", role: "member", name: "Rep" });
    expect(await usersService.assertStaffEmail(staff.publicId)).toBe("rep@example.com");
    expect(await credentialPassword(staff.id)).toBeNull();
  });

  it("refuses an admin reset for a customer (non-staff)", async () => {
    const { publicId } = await createCustomer(
      { fullName: "Cust", phone: "+16475550104" },
      { actorId: null },
    );
    await expect(usersService.assertStaffEmail(publicId)).rejects.toThrow();
  });
});
