/** Integration: admin referrals list and the customer page's "Referred by". */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, or } from "drizzle-orm";

const { db } = await import("@/db/client");
const { users, referrals } = await import("@/db/schema");
const { listReferrals, getReferralInfo, referralStats } = await import("../referrals.service");

const PHONES = ["+16475550090", "+16475550091", "+16475550092", "+16475550093"];
let ids: bigint[] = [];

async function cleanup() {
  const ours = await db.select({ id: users.id }).from(users).where(inArray(users.phone, PHONES));
  const all = ours.map((u) => u.id);
  if (all.length === 0) return;
  await db.delete(referrals).where(or(inArray(referrals.referrerUserId, all), inArray(referrals.referredUserId, all)));
  await db.update(users).set({ referredByUserId: null }).where(inArray(users.id, all));
  await db.delete(users).where(inArray(users.id, all));
}

beforeAll(async () => {
  await cleanup();
  const made = await db
    .insert(users)
    .values([
      { phone: PHONES[0], email: "zq-referrer@test.invalid", name: "Zorawar Quill", role: "user" },
      { phone: PHONES[1], email: "zq-f1@test.invalid", name: "Amrit One", role: "user" },
      { phone: PHONES[2], email: "zq-f2@test.invalid", name: "Bela Two", role: "user" },
      { phone: PHONES[3], email: "zq-f3@test.invalid", name: "Chand Three", role: "user" },
    ])
    .returning({ id: users.id });
  ids = made.map((m) => m.id);
  const [r, a, b, c] = ids;
  await db.update(users).set({ referredByUserId: r }).where(inArray(users.id, [a, b, c]));
  const t = Date.now();
  await db.insert(referrals).values([
    { referrerUserId: r, referredUserId: a, status: "rewarded", referrerCoins: 20, friendCoins: 10, createdAt: t - 3000, updatedAt: t - 3000 },
    { referrerUserId: r, referredUserId: b, status: "joined", createdAt: t - 2000, updatedAt: t - 2000 },
    { referrerUserId: r, referredUserId: c, status: "reversed", referrerCoins: 20, friendCoins: 10, createdAt: t - 1000, updatedAt: t - 1000 },
  ]);
});
afterAll(cleanup);

describe("listReferrals", () => {
  it("filters by status", async () => {
    const res = await listReferrals({ status: "joined", search: "Zorawar", page: 0, pageSize: 50 });
    expect(res.rows.map((r) => r.friend.name)).toEqual(["Bela Two"]);
    expect(res.total).toBe(1);
  });

  it("searches referrer and friend by name, email or phone, newest first", async () => {
    const byReferrer = await listReferrals({ search: "zq-referrer@", page: 0, pageSize: 50 });
    expect(byReferrer.rows.map((r) => r.friend.name)).toEqual(["Chand Three", "Bela Two", "Amrit One"]);
    const byFriendPhone = await listReferrals({ search: PHONES[1], page: 0, pageSize: 50 });
    expect(byFriendPhone.rows).toHaveLength(1);
    expect(byFriendPhone.rows[0]).toMatchObject({ status: "rewarded", referrerCoins: 20, friendCoins: 10, referrer: { name: "Zorawar Quill" } });
  });

  it("pages", async () => {
    const p1 = await listReferrals({ search: "Zorawar", page: 1, pageSize: 2 });
    expect(p1.total).toBe(3);
    expect(p1.rows.map((r) => r.friend.name)).toEqual(["Amrit One"]);
  });
});

describe("getReferralInfo", () => {
  it("names who referred a customer and counts who they referred", async () => {
    const [r, a] = ids;
    expect(await getReferralInfo(a)).toMatchObject({ referredBy: { name: "Zorawar Quill" }, referredCount: 0 });
    expect(await getReferralInfo(r)).toMatchObject({ referredBy: null, referredCount: 3 });
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.phone, PHONES[0]));
    expect(row.id).toBe(r);
  });
});

describe("referralStats", () => {
  it("counts referrals by stage and sums coins paid, leaving out taken-back ones", async () => {
    const before = await referralStats();
    const [r] = ids;
    const [extra] = await db
      .insert(users)
      .values({ phone: "+16475550094", email: "zq-f4@test.invalid", name: "Dev Four", role: "user" })
      .returning({ id: users.id });
    PHONES.push("+16475550094");
    const t = Date.now();
    await db.insert(referrals).values({ referrerUserId: r, referredUserId: extra.id, status: "rewarded", referrerCoins: 30, friendCoins: 15, createdAt: t, updatedAt: t });
    const after = await referralStats();
    expect(after.total - before.total).toBe(1);
    expect(after.rewarded - before.rewarded).toBe(1);
    expect(after.waiting - before.waiting).toBe(0);
    expect(after.referrerCoins - before.referrerCoins).toBe(30);
    expect(after.friendCoins - before.friendCoins).toBe(15);
  });
});
