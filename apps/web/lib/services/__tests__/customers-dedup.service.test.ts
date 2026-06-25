import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ne } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { findExistingByContact } = await import("../customers.service");

async function reset() {
  await db.delete(users).where(ne(users.isSystem, true));
}

describe("findExistingByContact", () => {
  beforeEach(async () => {
    await reset();
    await db.insert(users).values({
      phone: "+16475550100",
      email: "match@x.com",
      name: "Existing Customer",
      role: "user",
    });
    await db.insert(users).values({
      phone: "+16475559999",
      name: "Staff Person",
      role: "admin",
    });
  });
  afterAll(reset);

  it("finds a user-role customer by matching phone", async () => {
    const r = await findExistingByContact("+16475550100");
    expect(r).not.toBeNull();
    expect(r?.fullName).toBe("Existing Customer");
  });

  it("matches case-insensitively on email", async () => {
    const r = await findExistingByContact("+1000000000", "MATCH@X.com");
    expect(r).not.toBeNull();
    expect(r?.fullName).toBe("Existing Customer");
  });

  it("returns null when no match", async () => {
    const r = await findExistingByContact("+19999999999");
    expect(r).toBeNull();
  });

  it("does not return a non-user role row with the same phone", async () => {
    const r = await findExistingByContact("+16475559999");
    expect(r).toBeNull();
  });
});
