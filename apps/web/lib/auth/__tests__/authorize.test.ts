import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { resolveCredentialUser } from "@/lib/auth/resolve-user";

async function reset() {
  await db.delete(users);
}

describe("resolveCredentialUser", () => {
  beforeEach(async () => {
    await reset();
    const hash = await hashPassword("Secret123");
    await db.insert(users).values({ email: "staff@x.com", phone: null, passwordHash: hash, role: "member" });
    await db.insert(users).values({ email: null, phone: "+16475550100", passwordHash: hash, role: "user" });
  });
  afterAll(reset);

  it("resolves a staff user by email", async () => {
    const u = await resolveCredentialUser("staff@x.com", "Secret123");
    expect(u?.role).toBe("member");
  });
  it("returns the public id (usr_…) as id, never the internal bigint", async () => {
    const u = await resolveCredentialUser("staff@x.com", "Secret123");
    expect(u?.id).toMatch(/^usr_/);
    expect(u?.id).toBe(u?.publicId);
  });
  it("resolves a customer by phone", async () => {
    const u = await resolveCredentialUser("+16475550100", "Secret123");
    expect(u?.role).toBe("user");
    expect(u?.id).toMatch(/^usr_/);
  });
  it("is case-insensitive for email", async () => {
    const u = await resolveCredentialUser("Staff@X.com", "Secret123");
    expect(u?.role).toBe("member");
  });
  it("rejects a wrong password", async () => {
    expect(await resolveCredentialUser("staff@x.com", "nope")).toBeNull();
  });
  it("rejects an unknown identifier", async () => {
    expect(await resolveCredentialUser("ghost@x.com", "Secret123")).toBeNull();
  });
});
