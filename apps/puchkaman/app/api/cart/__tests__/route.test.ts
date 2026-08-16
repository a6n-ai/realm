import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; role: string; email: string } } }));
const cookieJar = vi.hoisted(() => ({
  read: {} as Record<string, string>,
  written: [] as { name: string; value: string; options: Record<string, unknown> }[],
}));

vi.mock("@/lib/auth/session", () => ({ getSession: async () => session.current }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.read[name] ? { name, value: cookieJar.read[name] } : undefined),
    set: (name: string, value: string, options: Record<string, unknown>) => {
      cookieJar.written.push({ name, value, options });
    },
  }),
}));

const { db } = await import("@/db/client");
const { carts, users } = await import("@/db/schema");
const { POST } = await import("../route");

const MARK = "cart-route";
const userIds: bigint[] = [];

function post(body: unknown) {
  return POST(new Request("http://localhost/api/cart", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

const line = { productPublicId: "prd_a", name: "Pani puri", price: 9.5, category: "snacks", quantity: 2, modifiers: [] };

beforeEach(() => {
  session.current = null;
  cookieJar.read = {};
  cookieJar.written.length = 0;
});

afterEach(async () => {
  await db.delete(carts).where(like(carts.email, `${MARK}%`));
  for (const w of cookieJar.written) {
    await db.delete(carts).where(eq(carts.publicId, w.value));
  }
  if (userIds.length) {
    await db.delete(users).where(eq(users.id, userIds[0]));
    userIds.length = 0;
  }
});

describe("POST /api/cart", () => {
  it("creates a cart and sets an httpOnly cookie", async () => {
    const res = await post({ items: [line] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.publicId).toMatch(/^crt_/);
    expect(cookieJar.written).toHaveLength(1);
    expect(cookieJar.written[0].name).toBe("pk_cart");
    expect(cookieJar.written[0].options.httpOnly).toBe(true);
    expect(cookieJar.written[0].options.sameSite).toBe("lax");
  });

  it("reuses the cart named by the cookie instead of creating a second row", async () => {
    const first = await post({ items: [line] });
    const { publicId } = await first.json();
    cookieJar.read.pk_cart = publicId;
    cookieJar.written.length = 0;

    const second = await post({ items: [line, { ...line, productPublicId: "prd_b" }] });
    const body = await second.json();
    expect(body.publicId).toBe(publicId);
    const rows = await db.select().from(carts).where(eq(carts.publicId, publicId));
    expect(rows).toHaveLength(1);
    expect(rows[0].items).toHaveLength(2);
  });

  it("rejects an over-cap payload with 400", async () => {
    const res = await post({ items: Array.from({ length: 41 }, (_, i) => ({ ...line, productPublicId: `prd_${i}` })) });
    expect(res.status).toBe(400);
  });

  it("rejects a malformed body with 400", async () => {
    const res = await post({ items: [{ productPublicId: "prd_a" }] });
    expect(res.status).toBe(400);
  });

  it("refuses a cookie pointing at another user's cart", async () => {
    const [owner] = await db
      .insert(users)
      .values({ email: `${MARK}-owner@example.test`, name: MARK, role: "user", status: "active" })
      .returning({ id: users.id, publicId: users.publicId });
    userIds.push(owner.id);
    const [owned] = await db
      .insert(carts)
      .values({ items: [], userId: owner.id, lastActivityAt: Date.now(), email: `${MARK}-owner@example.test` })
      .returning({ publicId: carts.publicId });

    cookieJar.read.pk_cart = owned.publicId;
    session.current = { user: { id: "usr_someoneelse", role: "user", email: `${MARK}-other@example.test` } };

    const res = await post({ items: [line] });
    expect(res.status).toBe(403);
    const [untouched] = await db.select().from(carts).where(eq(carts.publicId, owned.publicId)).limit(1);
    expect(untouched.items).toHaveLength(0);
  });
});
