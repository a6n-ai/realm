import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ne } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { checkExistingAccount } = await import("../actions");

async function reset() {
  await db.delete(users).where(ne(users.isSystem, true));
}

describe("checkExistingAccount", () => {
  beforeEach(async () => {
    await reset();
    await db.insert(users).values({
      phone: "+16475550100",
      email: "existing@x.com",
      name: "Existing Customer",
      role: "user",
    });
  });
  afterAll(reset);

  it("returns matched for an email already tied to a customer account", async () => {
    const r = await checkExistingAccount("existing@x.com");
    expect(r).toEqual({ status: "matched" });
  });

  it("matches case-insensitively", async () => {
    const r = await checkExistingAccount("EXISTING@X.com");
    expect(r).toEqual({ status: "matched" });
  });

  it("returns new for an email with no account", async () => {
    const r = await checkExistingAccount("nobody@nowhere.invalid");
    expect(r).toEqual({ status: "new" });
  });

  it("returns new (not an error) for a malformed email", async () => {
    const r = await checkExistingAccount("not-an-email");
    expect(r).toEqual({ status: "new" });
  });

  it("never leaks fields beyond status", async () => {
    const r = await checkExistingAccount("existing@x.com");
    expect(Object.keys(r)).toEqual(["status"]);
  });
});
