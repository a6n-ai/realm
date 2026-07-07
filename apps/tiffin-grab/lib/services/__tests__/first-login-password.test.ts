import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, or } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { users, account } = await import("@/db/schema");
const { verifyPassword } = await import("@/lib/auth/password");
const { createCustomer } = await import("../customers.service");
const { usersService } = await import("../users.service");

const PHONES = ["+16475550101", "+16475550102", "+16475550103"];
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

  it("provisions a customer needing a password set, with a credential hash", async () => {
    const { publicId } = await createCustomer(
      { fullName: "New Cust", phone: "+16475550101" },
      { actorId: null },
    );
    const row = await rowByPublicId(publicId);
    expect(row.passwordSet).toBe(false);
    const hash = await credentialPassword(row.id);
    expect(hash).toBeTruthy(); // a unique random temp is set; the holder claims via set/forgot-password
  });

  it("setOwnPassword replaces the credential and clears the must-set flag", async () => {
    const { publicId } = await createCustomer(
      { fullName: "Setter", phone: "+16475550102" },
      { actorId: null },
    );
    await usersService.setOwnPassword(publicId, "my-real-pass9");
    const row = await rowByPublicId(publicId);
    expect(row.passwordSet).toBe(true);
    const hash = await credentialPassword(row.id);
    expect(await verifyPassword("my-real-pass9", hash!)).toBe(true);
  });

  it("admin reset re-arms a staff member's default password and must-set flag", async () => {
    // Staff created without a credential; reset both creates one and forces set.
    const staff = await usersService.create({ email: "rep@example.com", role: "member", name: "Rep" });
    expect(await credentialPassword(staff.id)).toBeNull();

    const { tempPassword } = await usersService.resetToDefaultPassword(staff.publicId);
    expect(tempPassword).toHaveLength(24); // unique random temp, not a shared constant
    const row = await rowByPublicId(staff.publicId);
    expect(row.passwordSet).toBe(false);
    const hash = await credentialPassword(row.id);
    // the returned temp is what was actually written to the credential
    expect(await verifyPassword(tempPassword, hash!)).toBe(true);
  });

  it("refuses to reset a customer (non-staff) password", async () => {
    const { publicId } = await createCustomer(
      { fullName: "Cust", phone: "+16475550103" },
      { actorId: null },
    );
    await expect(usersService.resetToDefaultPassword(publicId)).rejects.toThrow();
  });
});
