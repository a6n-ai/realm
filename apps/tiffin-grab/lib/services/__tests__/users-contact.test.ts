import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ne } from "drizzle-orm";
import { ValidationError } from "@realm/commons";
import { db } from "@/db/client";
import { users } from "@/db/schema";

// Importing the users service transitively evaluates NextAuth(), which can't
// load `next/server` under vitest's node env. Stub the session lookup.
vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { usersService } = await import("../users.service");

let custId: string;
async function reset() {
  await db.delete(users).where(ne(users.isSystem, true));
}

describe("usersService.updateContact", () => {
  beforeEach(async () => {
    await reset();
    const [c] = await db.insert(users).values({ phone: "+16475550100", role: "user" }).returning();
    await db.insert(users).values({ phone: "+16475550200", role: "user" });
    custId = c.publicId;
  });
  afterAll(reset);

  it("updates a customer's email when free (normalized)", async () => {
    const u = await usersService.updateContact(custId, { email: "Me@X.com" });
    expect(u.email).toBe("me@x.com");
  });
  it("rejects a phone owned by another user", async () => {
    await expect(usersService.updateContact(custId, { phone: "+16475550200" }))
      .rejects.toBeInstanceOf(ValidationError);
  });
  it("rejects clearing the customer's required phone", async () => {
    await expect(usersService.updateContact(custId, { phone: "" }))
      .rejects.toBeInstanceOf(ValidationError);
  });
  it("rejects a malformed phone", async () => {
    await expect(usersService.updateContact(custId, { phone: "12" }))
      .rejects.toBeInstanceOf(ValidationError);
  });
  it("rejects a malformed email", async () => {
    await expect(usersService.updateContact(custId, { email: "nope" }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it("stores phone as E.164 when a national number is provided", async () => {
    const u = await usersService.updateContact(custId, { phone: "647 555 0101" });
    expect(u.phone).toBe("+16475550101");
  });
});
