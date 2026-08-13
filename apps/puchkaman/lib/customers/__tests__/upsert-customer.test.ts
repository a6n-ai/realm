import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { upsertCustomer } from "@/lib/customers/upsert-customer";

const MARK = "upsert-cust";
const emails: string[] = [];

async function make(email: string, name?: string, phone?: string): Promise<bigint> {
  emails.push(email.toLowerCase());
  return db.transaction((tx) => upsertCustomer(tx, { email, name, phone }));
}

afterEach(async () => {
  if (emails.length) await db.delete(users).where(inArray(users.email, emails));
  emails.length = 0;
});

describe("upsertCustomer", () => {
  it("creates a customer with no credential and the user role", async () => {
    const id = await make(`${MARK}-a@example.test`, "Ada");
    const [row] = await db
      .select({
        role: users.role,
        status: users.status,
        passwordSet: users.passwordSet,
        name: users.name,
      })
      .from(users)
      .where(eq(users.id, id));
    expect(row).toEqual({ role: "user", status: "active", passwordSet: false, name: "Ada" });
  });

  it("is idempotent on the email and returns the same id", async () => {
    const email = `${MARK}-b@example.test`;
    const first = await make(email, "Ada");
    const second = await db.transaction((tx) => upsertCustomer(tx, { email, name: "Ada" }));
    expect(second).toBe(first);
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    expect(rows).toHaveLength(1);
  });

  it("normalizes the email to lowercase", async () => {
    const id = await make(`${MARK}-C@Example.TEST`);
    const [row] = await db.select({ email: users.email }).from(users).where(eq(users.id, id));
    expect(row.email).toBe(`${MARK}-c@example.test`);
  });

  it("fills a missing name or phone on a later order without overwriting an existing one", async () => {
    const email = `${MARK}-d@example.test`;
    const id = await make(email, undefined, undefined);
    await db.transaction((tx) => upsertCustomer(tx, { email, name: "Grace", phone: "+14165550134" }));
    const [row] = await db
      .select({ name: users.name, phone: users.phone })
      .from(users)
      .where(eq(users.id, id));
    expect(row).toEqual({ name: "Grace", phone: "+14165550134" });

    await db.transaction((tx) => upsertCustomer(tx, { email, name: "Typo", phone: "+10000000000" }));
    const [after] = await db
      .select({ name: users.name, phone: users.phone })
      .from(users)
      .where(eq(users.id, id));
    expect(after).toEqual({ name: "Grace", phone: "+14165550134" });
  });

  it("never promotes or renames an existing staff account", async () => {
    const email = `${MARK}-e@example.test`;
    emails.push(email);
    await db.insert(users).values({ email, name: "Staff", role: "admin", status: "active" });
    await db.transaction((tx) => upsertCustomer(tx, { email, name: "Impostor" }));
    const [row] = await db
      .select({ role: users.role, name: users.name })
      .from(users)
      .where(eq(users.email, email));
    expect(row).toEqual({ role: "admin", name: "Staff" });
  });
});
