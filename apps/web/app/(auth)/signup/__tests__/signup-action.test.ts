import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { account, users } from "@/db/schema";
import { signUpCustomer } from "../actions";

async function reset() { await db.delete(account); await db.delete(users); }

describe("signUpCustomer", () => {
  beforeEach(reset);
  afterAll(reset);

  it("creates a phone-only customer + credential account", async () => {
    const r = await signUpCustomer({ phone: "+16475550111", password: "hunter2!" });
    expect(r.ok).toBe(true);
    const [u] = await db.select().from(users).where(eq(users.phone, "+16475550111"));
    expect(u.role).toBe("user");
    expect(u.email).toBeNull();
    const [a] = await db.select().from(account).where(eq(account.userId, u.id));
    expect(a.providerId).toBe("credential");
    expect(a.password).not.toBe("hunter2!");
  });

  it("rejects a duplicate phone without creating a second user", async () => {
    await signUpCustomer({ phone: "+16475550111", password: "hunter2!" });
    const r = await signUpCustomer({ phone: "+16475550111", password: "another1!" });
    expect(r.ok).toBe(false);
    const rows = await db.select().from(users).where(eq(users.phone, "+16475550111"));
    expect(rows.length).toBe(1);
  });

  it("rejects a too-short password", async () => {
    const r = await signUpCustomer({ phone: "+16475550112", password: "short" });
    expect(r.ok).toBe(false);
  });
});
