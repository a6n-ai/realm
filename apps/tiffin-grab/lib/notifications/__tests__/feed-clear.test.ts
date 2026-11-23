import { afterAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationTables, users } from "@/db/schema";
import { clearFeed, getFeed, markRead } from "../feed";

const n = notificationTables.notifications;
const seeded: bigint[] = [];

async function userWithFeed(count: number) {
  const [u] = await db
    .insert(users)
    .values({ email: `feed${Math.random().toString(36).slice(2)}@test.invalid`, name: "Feed", role: "admin" })
    .returning({ id: users.id });
  seeded.push(u.id);
  const rows = await db
    .insert(n)
    .values(Array.from({ length: count }, (_, i) => ({ userId: u.id, title: `t${i}`, body: "b" })))
    .returning({ publicId: n.publicId });
  return { id: u.id, ids: rows.map((r) => r.publicId) };
}

afterAll(async () => {
  if (seeded.length === 0) return;
  await db.delete(n).where(inArray(n.userId, seeded));
  await db.delete(users).where(inArray(users.id, seeded));
});

describe("markRead by id", () => {
  it("marks only the given notification read", async () => {
    const me = await userWithFeed(2);
    expect(await markRead(me.id, [me.ids[0]!])).toBe(1);
    expect((await getFeed(me.id)).unread).toBe(1);
  });
});

describe("clearFeed", () => {
  it("clears the given ids, then everything, and never another user's rows", async () => {
    const me = await userWithFeed(3);
    const other = await userWithFeed(2);

    expect(await clearFeed(me.id, [me.ids[0]!, other.ids[0]!])).toBe(1);
    expect((await getFeed(me.id)).items).toHaveLength(2);

    expect(await clearFeed(me.id)).toBe(2);
    expect(await getFeed(me.id)).toEqual({ items: [], unread: 0 });
    expect((await getFeed(other.id)).items).toHaveLength(2);
  });
});
