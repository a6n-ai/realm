import { afterEach, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";

const { db } = await import("@/db/client");
const { users } = await import("@/db/schema");
const { POST } = await import("./route");

const MARK = "signup-route";

// isRateLimited buckets per IP, and the module keeps counters for the whole test
// file — so every case sends a distinct address rather than sharing one bucket.
let ipSeq = 0;
function post(body: unknown) {
  ipSeq += 1;
  return POST(
    new Request("http://localhost/api/account/signup", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": `10.9.${ipSeq}.1` },
      body: JSON.stringify(body),
    }),
  );
}

afterEach(async () => {
  await db.delete(users).where(like(users.email, `%${MARK}%`));
});

describe("POST /api/account/signup", () => {
  it("reports an unknown address as unknown and creates nothing", async () => {
    const email = `${MARK}-new@example.test`;
    const res = await post({ email });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ known: false, created: false });
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    expect(rows).toHaveLength(0);
  });

  it("creates a credential-less customer once a name is supplied", async () => {
    const email = `${MARK}-create@example.test`;
    const res = await post({ email, name: "Ada Lovelace", phone: "+14165550123" });

    expect(await res.json()).toEqual({ known: true, created: true });
    const [row] = await db
      .select({ role: users.role, name: users.name, phone: users.phone, passwordSet: users.passwordSet, status: users.status })
      .from(users)
      .where(eq(users.email, email));
    expect(row).toMatchObject({
      role: "user",
      name: "Ada Lovelace",
      phone: "+14165550123",
      passwordSet: false,
      status: "active",
    });
  });

  it("lowercases the address so a mixed-case retry is the same account", async () => {
    const email = `${MARK}-Case@Example.test`;
    await post({ email, name: "Case Test" });
    const again = await post({ email: email.toLowerCase() });

    expect(await again.json()).toEqual({ known: true, created: false });
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase()));
    expect(rows).toHaveLength(1);
  });

  it("does not overwrite an existing account, and never touches its role", async () => {
    const email = `${MARK}-staff@example.test`;
    await db.insert(users).values({ email, name: "Real Name", role: "admin", status: "active" });

    const res = await post({ email, name: "Impostor" });

    expect(await res.json()).toEqual({ known: true, created: false });
    const [row] = await db.select({ name: users.name, role: users.role }).from(users).where(eq(users.email, email));
    expect(row).toEqual({ name: "Real Name", role: "admin" });
  });

  it("rejects a malformed address", async () => {
    const res = await post({ email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  it("throttles repeated attempts from one caller", async () => {
    const ip = "10.7.7.7";
    const attempt = (n: number) =>
      POST(
        new Request("http://localhost/api/account/signup", {
          method: "POST",
          headers: { "content-type": "application/json", "x-real-ip": ip },
          body: JSON.stringify({ email: `${MARK}-flood-${n}@example.test` }),
        }),
      );

    const statuses: number[] = [];
    for (let n = 0; n < 20; n += 1) statuses.push((await attempt(n)).status);

    expect(statuses).toContain(429);
    expect(statuses.at(-1)).toBe(429);
  });
});
