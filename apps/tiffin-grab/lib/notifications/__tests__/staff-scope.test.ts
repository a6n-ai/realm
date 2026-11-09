// @vitest-db
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, like } from "drizzle-orm";

const { db } = await import("@/db/client");
const { member, notificationOutbox, notifications, organization, users } = await import("@/db/schema");
const { enqueueStaffNotification } = await import("../enqueue");

const R = Math.random().toString(36).slice(2, 8);
let orgA = "";
let orgB = "";
const ids: Record<"inA" | "inB" | "superAdmin" | "customer", bigint> = { inA: 0n, inB: 0n, superAdmin: 0n, customer: 0n };

beforeAll(async () => {
  [{ id: orgA }] = await db.insert(organization).values({ name: "Scope A", clientCode: `SA-${R}` }).returning({ id: organization.id });
  [{ id: orgB }] = await db.insert(organization).values({ name: "Scope B", clientCode: `SB-${R}` }).returning({ id: organization.id });
  const seed = async (key: keyof typeof ids, role: "admin" | "member" | "user", platformRole: string | null = null) => {
    const [u] = await db.insert(users).values({ email: `scope-${key}-${R}@test.invalid`, name: key, role, platformRole }).returning({ id: users.id });
    ids[key] = u.id;
  };
  await seed("inA", "member");
  await seed("inB", "admin");
  await seed("superAdmin", "admin", "super_admin");
  await seed("customer", "user");
  await db.insert(member).values([
    { organizationId: orgA, userId: ids.inA, role: "member" },
    { organizationId: orgB, userId: ids.inB, role: "admin" },
    { organizationId: orgA, userId: ids.customer, role: "member" },
  ]);
});

afterAll(async () => {
  const mine = Object.values(ids);
  await db.delete(notificationOutbox).where(inArray(notificationOutbox.recipientId, mine));
  await db.delete(notifications).where(inArray(notifications.userId, mine));
  await db.delete(member).where(inArray(member.userId, mine));
  await db.delete(users).where(like(users.email, `scope-%-${R}@test.invalid`));
  await db.delete(organization).where(inArray(organization.id, [orgA, orgB]));
});

const told = async (key: string) => {
  const rows = await db
    .select({ id: notificationOutbox.recipientId })
    .from(notificationOutbox)
    .where(and(like(notificationOutbox.dedupeKey, `${key}:u%`), inArray(notificationOutbox.recipientId, Object.values(ids))));
  const byId = new Map(Object.entries(ids).map(([k, v]) => [v, k]));
  return [...new Set(rows.map((r) => byId.get(r.id!)))].sort();
};

describe("enqueueStaffNotification", () => {
  it("tells only the record's franchise staff and super-admins, never customers or other franchises", async () => {
    await db.transaction((tx) => enqueueStaffNotification(tx, { organizationId: orgA, title: "t", body: "b", dedupeKey: `scope-a-${R}` }));
    expect(await told(`scope-a-${R}`)).toEqual(["inA", "superAdmin"]);
  });

  it("tells all staff when the record has no franchise", async () => {
    await db.transaction((tx) => enqueueStaffNotification(tx, { organizationId: null, title: "t", body: "b", dedupeKey: `scope-n-${R}` }));
    expect(await told(`scope-n-${R}`)).toEqual(["inA", "inB", "superAdmin"]);
  });

  it("a repeat adds nothing", async () => {
    const send = () => db.transaction((tx) => enqueueStaffNotification(tx, { organizationId: orgB, title: "t", body: "b", dedupeKey: `scope-b-${R}` }));
    await send();
    await send();
    const rows = await db.select().from(notificationOutbox).where(and(eq(notificationOutbox.recipientId, ids.inB), like(notificationOutbox.dedupeKey, `scope-b-${R}:u%`)));
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((r) => r.channel)).size).toBe(rows.length);
  });
});
