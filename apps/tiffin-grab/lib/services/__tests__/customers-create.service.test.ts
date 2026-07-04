import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { ValidationError } from "@tiffin/commons";
import { db } from "@/db/client";
import { account, users } from "@/db/schema";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { createCustomer } = await import("../customers.service");

const PHONE = "+16475553000";
const PHONE_EMAIL = "+16475553001";
const PHONE_CLASH = "+16475553002";
const PHONE_BAD = "+16475553003";
const CLASH_OWNER_PHONE = "+16475553009";
const EMAIL = "walkin@example.com";
const CLASH_EMAIL = "taken@example.com";
const ALL_PHONES = [PHONE, PHONE_EMAIL, PHONE_CLASH, PHONE_BAD, CLASH_OWNER_PHONE];

async function cleanup() {
  const rows = await db.select({ id: users.id }).from(users).where(inArray(users.phone, ALL_PHONES));
  for (const r of rows) {
    await db.delete(account).where(eq(account.userId, r.id));
    await db.delete(users).where(eq(users.id, r.id));
  }
}

describe("createCustomer", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("provisions a user + credential account and returns a publicId", async () => {
    const { publicId } = await createCustomer({ fullName: "Walk In", phone: PHONE }, {});
    expect(publicId).toMatch(/^usr_/);
    const [u] = await db.select().from(users).where(eq(users.publicId, publicId));
    expect(u.role).toBe("user");
    const [acc] = await db.select().from(account).where(eq(account.userId, u.id));
    expect(acc.providerId).toBe("credential");
  });

  it("is idempotent by phone — second call returns the same customer", async () => {
    const first = await createCustomer({ fullName: "Walk In", phone: PHONE }, {});
    const second = await createCustomer({ fullName: "Walk In Again", phone: PHONE }, {});
    expect(second.publicId).toBe(first.publicId);
    const n = await db.select({ id: users.id }).from(users).where(eq(users.phone, PHONE));
    expect(n).toHaveLength(1);
  });

  it("persists the email and stamps createdBy from the acting staff", async () => {
    const [staff] = await db
      .select({ id: users.id, publicId: users.publicId })
      .from(users)
      .where(inArray(users.role, ["admin", "member"]))
      .limit(1);
    expect(staff).toBeTruthy(); // seeded staff present

    const { publicId } = await createCustomer(
      { fullName: "With Email", phone: PHONE_EMAIL, email: EMAIL },
      { actorId: staff.publicId },
    );
    const [u] = await db.select().from(users).where(eq(users.publicId, publicId));
    expect(u.email).toBe(EMAIL);
    expect(u.createdBy).toBe(staff.id);
  });

  it("rejects when the email already belongs to another user", async () => {
    await db.insert(users).values({ phone: CLASH_OWNER_PHONE, email: CLASH_EMAIL, name: "Owner", role: "user" });
    await expect(
      createCustomer({ fullName: "Clasher", phone: PHONE_CLASH, email: CLASH_EMAIL }, {}),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a malformed email", async () => {
    await expect(
      createCustomer({ fullName: "Bad Email", phone: PHONE_BAD, email: "not-an-email" }, {}),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
