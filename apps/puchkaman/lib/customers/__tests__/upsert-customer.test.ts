import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { customerUpdateSet, upsertCustomer } from "@/lib/customers/upsert-customer";

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

  // A populated name/phone is already protected by plain COALESCE — that proves
  // nothing about this guard. The guard only matters on a BLANK column: a
  // customer who claimed the account (password set, or OTP-verified) but never
  // filled in a name/phone must not have a guest checkout fill it in for them.
  it("leaves a claimed account's blank name and phone alone (passwordSet)", async () => {
    const email = `${MARK}-f@example.test`;
    const id = await make(email, undefined, undefined);
    await db.update(users).set({ passwordSet: true }).where(eq(users.id, id));
    await db.transaction((tx) => upsertCustomer(tx, { email, name: "Attacker", phone: "+15559999999" }));
    const [row] = await db.select({ name: users.name, phone: users.phone }).from(users).where(eq(users.id, id));
    expect(row).toEqual({ name: null, phone: null });
  });

  it("leaves a claimed account's blank name and phone alone (emailVerified, the OTP-only customer)", async () => {
    const email = `${MARK}-g@example.test`;
    const id = await make(email, undefined, undefined);
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, id));
    await db.transaction((tx) => upsertCustomer(tx, { email, name: "Attacker", phone: "+15559999999" }));
    const [row] = await db.select({ name: users.name, phone: users.phone }).from(users).where(eq(users.id, id));
    expect(row).toEqual({ name: null, phone: null });
  });
});

/**
 * A guest checkout may fill in blanks on a record that was never claimed. It may
 * not write to an account someone actually signed into — otherwise ordering with
 * a stranger's email rewrites their profile.
 *
 * `customerUpdateSet[column]` is a drizzle `sql` template holding query chunks
 * and column refs (a `PgTable` back-reference makes it circular), not a plain
 * value — JSON.stringify can't render it. Compile it to the real SQL string via
 * the pg dialect instead, so the assertion proves the guard columns are actually
 * in the emitted statement.
 */
const dialect = new PgDialect();
const sql = (v: unknown) => dialect.sqlToQuery(v as Parameters<PgDialect["sqlToQuery"]>[0]).sql;

describe("customerUpdateSet", () => {
  it("guards both writable columns on the row not being a claimed account", () => {
    for (const column of ["name", "phone"] as const) {
      const clause = sql(customerUpdateSet[column]);
      expect(clause).toContain("password_set");
      expect(clause).toContain("email_verified");
    }
  });

  it("never writes role or status", () => {
    expect(customerUpdateSet).not.toHaveProperty("role");
    expect(customerUpdateSet).not.toHaveProperty("status");
  });
});
