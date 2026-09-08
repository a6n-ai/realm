import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { findExistingByContact, provisionCustomerByPhone, STAFF_ACCOUNT_MESSAGE } = await import("../customers.service");

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
    await db.insert(users).values({ email: `u${Math.random().toString(36).slice(2)}@test.invalid`, 
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

describe("provisionCustomerByPhone", () => {
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
      email: "staff@x.com",
      name: "Staff Person",
      role: "admin",
    });
  });
  afterAll(reset);

  it("returns the existing id for a role=user phone match", async () => {
    await db.transaction(async (tx) => {
      const id = await provisionCustomerByPhone(
        tx,
        { fullName: "Existing Customer", phone: "+16475550100", email: "match@x.com" },
        null,
      );
      const [row] = await tx.select().from(users).where(eq(users.id, id));
      expect(row.role).toBe("user");
    });
  });

  it("refuses to reuse a staff account matched by phone", async () => {
    await expect(
      db.transaction(async (tx) => {
        await provisionCustomerByPhone(
          tx,
          { fullName: "Someone", phone: "+16475559999", email: "someone-else@test.invalid" },
          null,
        );
      }),
    ).rejects.toThrow(STAFF_ACCOUNT_MESSAGE);
  });

  it("refuses to reuse a staff account matched by email", async () => {
    await expect(
      db.transaction(async (tx) => {
        await provisionCustomerByPhone(
          tx,
          { fullName: "Someone", phone: "+16475551234", email: "staff@x.com" },
          null,
        );
      }),
    ).rejects.toThrow(STAFF_ACCOUNT_MESSAGE);
  });

  it("still provisions a brand-new role=user account when neither phone nor email collide", async () => {
    await db.transaction(async (tx) => {
      const id = await provisionCustomerByPhone(
        tx,
        { fullName: "Brand New", phone: "+16475551234", email: "brand-new@test.invalid" },
        null,
      );
      const [row] = await tx.select().from(users).where(eq(users.id, id));
      expect(row.role).toBe("user");
      expect(row.name).toBe("Brand New");
    });
  });
});
