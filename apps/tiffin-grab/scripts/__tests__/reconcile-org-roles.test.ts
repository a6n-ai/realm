import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deleteNonSystemUsers } = await import("@/db/test-helpers");
const { member, organization, users } = await import("@/db/schema");
const { getBrandOrgId } = await import("@/lib/services/organizations.service");
const { reconcileOrgRoles } = await import("../reconcile-org-roles");

let brand: string;
let franchise: string;
const ZERO = { updated: 0, inserted: 0, owners: 0 };

async function mk(key: string, role: "admin" | "member" | "user", platformRole: string | null = null) {
  const [u] = await db.insert(users).values({ name: key, email: `${key}@reconcile.test`, role, platformRole }).returning({ id: users.id });
  return u.id;
}
const row = async (org: string, userId: bigint) =>
  (await db.select({ role: member.role }).from(member).where(and(eq(member.organizationId, org), eq(member.userId, userId))))[0]?.role;
const give = (org: string, userId: bigint, role: string) => db.insert(member).values({ organizationId: org, userId, role });
const run = (ownerEmails: string[] = []) => reconcileOrgRoles(db, { ownerEmails });

async function reset() {
  await deleteNonSystemUsers();
  await db.delete(organization).where(eq(organization.clientCode, "RECONCILE-FR"));
}

beforeEach(async () => {
  await reset();
  brand = (await getBrandOrgId())!;
  [{ id: franchise }] = await db.insert(organization).values({ name: "Reconcile FR", clientCode: "RECONCILE-FR", slug: "reconcile-fr", parentOrganizationId: brand }).returning({ id: organization.id });
});
afterAll(reset);

describe("reconcileOrgRoles", () => {
  it("sets brand row to users.role", async () => {
    const id = await mk("m1", "member");
    await give(brand, id, "admin");
    expect((await run()).updated).toBe(1);
    expect(await row(brand, id)).toBe("member");
  });

  it("inserts an owner row for a super_admin with none", async () => {
    const id = await mk("sa", "user", "super_admin");
    expect((await run()).owners).toBe(1);
    expect(await row(brand, id)).toBe("owner");
  });

  it("promotes an ownerEmails user", async () => {
    const id = await mk("boss", "admin");
    await give(brand, id, "admin");
    expect((await run(["Boss@reconcile.test"])).owners).toBe(1);
    expect(await row(brand, id)).toBe("owner");
  });

  it("inserts brand row for staff with no membership", async () => {
    const a = await mk("st", "admin");
    const m = await mk("st2", "member");
    await mk("cust", "user");
    expect((await run()).inserted).toBeGreaterThanOrEqual(2);
    expect(await row(brand, a)).toBe("admin");
    expect(await row(brand, m)).toBe("member");
  });

  it("leaves franchise and custom-role rows alone", async () => {
    const f = await mk("f1", "member");
    await give(franchise, f, "admin");
    await give(brand, f, "kitchen,driver");
    await run();
    expect(await row(franchise, f)).toBe("admin");
    expect(await row(brand, f)).toBe("kitchen,driver");
  });

  it("warns about customers holding rows without touching them", async () => {
    const c = await mk("c1", "user");
    await give(brand, c, "admin");
    const r = await run();
    expect(r.customersWithRows).toBeGreaterThanOrEqual(1);
    expect(await row(brand, c)).toBe("admin");
  });

  it("unknown owner email throws and changes nothing", async () => {
    const id = await mk("m2", "member");
    await give(brand, id, "admin");
    const sa = await mk("sa2", "user", "super_admin");
    await expect(run(["nobody@reconcile.test"])).rejects.toThrow(/nobody@reconcile.test/);
    expect(await row(brand, id)).toBe("admin");
    expect(await row(brand, sa)).toBeUndefined();
  });

  it("dry run rolls back", async () => {
    const id = await mk("m3", "member");
    await give(brand, id, "admin");
    const r = await reconcileOrgRoles(db, { ownerEmails: [], dryRun: true });
    expect(r.updated).toBe(1);
    expect(await row(brand, id)).toBe("admin");
  });

  it("second run is all zeros", async () => {
    await give(brand, await mk("m4", "member"), "admin");
    await mk("sa3", "user", "super_admin");
    await mk("st3", "admin");
    await run();
    expect(await run()).toMatchObject(ZERO);
  });
});
