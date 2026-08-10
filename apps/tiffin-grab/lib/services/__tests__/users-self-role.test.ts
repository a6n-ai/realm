// Demoting your own row out of `admin` locks you out of /dashboard/users, which is the
// only place to promote yourself back — recovery is a database edit. The guard lives in
// usersService.setRole rather than the server action so every caller inherits it.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "@/db/client";
import { session, users } from "@/db/schema";

// Mutable so each test can decide who is acting. session.user.id is the publicId.
let actingPublicId: string | null = null;
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => (actingPublicId ? { user: { id: actingPublicId } } : null),
}));
vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { usersService } = await import("../users.service");

const P = "selfroletest";

async function reset() {
  const mine = await db.select({ id: users.id }).from(users).where(like(users.email, `${P}-%`));
  for (const u of mine) await db.delete(session).where(eq(session.userId, u.id));
  await db.delete(users).where(like(users.email, `${P}-%`));
}

async function admin() {
  const [u] = await db
    .insert(users)
    .values({
      email: `${P}-${Math.random().toString(36).slice(2)}@test.invalid`,
      role: "admin",
      status: "active",
    })
    .returning();
  return u;
}

const roleOf = async (id: bigint) =>
  (await db.select({ role: users.role }).from(users).where(eq(users.id, id)))[0]?.role;

describe("setRole self-demotion guard", () => {
  beforeEach(async () => {
    actingPublicId = null;
    await reset();
  });
  afterAll(reset);

  it("refuses to change your own role, and leaves it untouched", async () => {
    const me = await admin();
    actingPublicId = me.publicId;

    await expect(usersService.setRole(me.publicId, "member")).rejects.toThrow(/your own role/i);
    expect(await roleOf(me.id)).toBe("admin");
  });

  it("still lets an admin change someone else's role", async () => {
    const me = await admin();
    const them = await admin();
    actingPublicId = me.publicId;

    await usersService.setRole(them.publicId, "member");

    expect(await roleOf(them.id)).toBe("member");
    expect(await roleOf(me.id)).toBe("admin");
  });

  it("rejects an unknown user rather than silently doing nothing", async () => {
    const me = await admin();
    actingPublicId = me.publicId;
    await expect(usersService.setRole("usr_does_not_exist", "member")).rejects.toThrow(/not found/i);
  });
});
