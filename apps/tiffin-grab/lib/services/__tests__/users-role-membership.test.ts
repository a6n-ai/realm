// users.role gates the console, member rows scope what staff see. setRole keeps the two
// in step so a promoted user shows up under Organization > Members.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "@/db/client";
import { member, organization, session, users } from "@/db/schema";

let actingPublicId: string | null = null;
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => (actingPublicId ? { user: { id: actingPublicId } } : null),
}));
vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { usersService } = await import("../users.service");
const { getBrandOrganizationId } = await import("../organizations.service");

const P = "rolemembertest";

async function reset() {
  const mine = await db.select({ id: users.id }).from(users).where(like(users.email, `${P}-%`));
  for (const u of mine) await db.delete(session).where(eq(session.userId, u.id));
  await db.delete(users).where(like(users.email, `${P}-%`));
  await db.delete(organization).where(like(organization.clientCode, `${P}-%`));
}

async function user(role: "admin" | "member" | "user") {
  const [u] = await db
    .insert(users)
    .values({ email: `${P}-${Math.random().toString(36).slice(2)}@test.invalid`, role, status: "active" })
    .returning();
  return u;
}

async function brandId(): Promise<string> {
  const existing = await getBrandOrganizationId();
  if (existing) return existing;
  const [o] = await db
    .insert(organization)
    .values({ name: "Brand", clientCode: `${P}-brand` })
    .returning({ id: organization.id });
  return o.id;
}

const orgsOf = async (id: bigint) =>
  (await db.select({ org: member.organizationId, role: member.role }).from(member).where(eq(member.userId, id)));

describe("setRole keeps member rows in sync", () => {
  beforeEach(async () => {
    await reset();
    actingPublicId = (await user("admin")).publicId;
  });
  afterAll(reset);

  it("adds a promoted customer to the brand org with their new role", async () => {
    const brand = await brandId();
    const u = await user("user");
    await usersService.setRole(u.publicId, "member");
    expect(await orgsOf(u.id)).toEqual([{ org: brand, role: "member" }]);
  });

  it("leaves existing franchise memberships alone instead of adding brand access", async () => {
    await brandId();
    const [franchise] = await db
      .insert(organization)
      .values({ name: "Franchise", clientCode: `${P}-fr` })
      .returning({ id: organization.id });
    const u = await user("member");
    await db.insert(member).values({ organizationId: franchise.id, userId: u.id, role: "member" });

    await usersService.setRole(u.publicId, "admin");

    expect(await orgsOf(u.id)).toEqual([{ org: franchise.id, role: "member" }]);
  });

  it("drops every membership when demoted to customer", async () => {
    const brand = await brandId();
    const u = await user("member");
    await db.insert(member).values({ organizationId: brand, userId: u.id, role: "member" });

    await usersService.setRole(u.publicId, "user");

    expect(await orgsOf(u.id)).toEqual([]);
  });
});
