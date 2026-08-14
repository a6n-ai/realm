import { afterEach, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { assertSessionAllowed } from "@/lib/auth/index";

const MARK = "login-gate";
const emails: string[] = [];

async function make(
  email: string,
  role: "admin" | "member" | "user",
  status: "active" | "suspended" = "active",
): Promise<bigint> {
  emails.push(email);
  const [u] = await db
    .insert(users)
    .values({ email, name: MARK, role, status })
    .returning({ id: users.id });
  return u.id;
}

afterEach(async () => {
  if (emails.length) await db.delete(users).where(inArray(users.email, emails));
  emails.length = 0;
});

describe("assertSessionAllowed", () => {
  it("allows an active admin", async () => {
    const id = await make(`${MARK}-a@example.test`, "admin");
    await expect(assertSessionAllowed(id)).resolves.toBeUndefined();
  });

  it("allows an active member", async () => {
    const id = await make(`${MARK}-b@example.test`, "member");
    await expect(assertSessionAllowed(id)).resolves.toBeUndefined();
  });

  it("allows an active customer", async () => {
    const id = await make(`${MARK}-c@example.test`, "user");
    await expect(assertSessionAllowed(id)).resolves.toBeUndefined();
  });

  it("rejects a suspended staff account", async () => {
    const id = await make(`${MARK}-d@example.test`, "admin", "suspended");
    await expect(assertSessionAllowed(id)).rejects.toThrow(/not active/i);
  });
});
