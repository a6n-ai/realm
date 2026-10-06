import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inArray, like, or } from "drizzle-orm";

// Local dev DB.
const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { friendsService } = await import("../friends.service");

const MARK = "friends-it";
type U = { id: bigint; publicId: string };
let a: U, b: U, c: U, staff: U;

async function mk(name: string, role: "user" | "admin", username: string | null): Promise<U> {
  const [u] = await db
    .insert(schema.users)
    .values({ name: `${MARK} ${name}`, email: `${MARK}-${name}@example.test`, role, username, displayUsername: username })
    .returning({ id: schema.users.id, publicId: schema.users.publicId });
  return u!;
}

async function cleanup() {
  const ids = (await db.select({ id: schema.users.id }).from(schema.users).where(like(schema.users.email, `${MARK}-%`))).map(
    (r) => r.id,
  );
  if (ids.length === 0) return;
  await db
    .delete(schema.friendships)
    .where(or(inArray(schema.friendships.requesterId, ids), inArray(schema.friendships.addresseeId, ids)));
  await db.delete(schema.users).where(inArray(schema.users.id, ids));
}

beforeEach(async () => {
  await cleanup();
  a = await mk("ana", "user", "friendsit_ana");
  b = await mk("ben", "user", "friendsit_ben");
  c = await mk("cy", "user", null);
  staff = await mk("staff", "admin", "friendsit_staff");
});

afterEach(cleanup);

const pairRows = () =>
  db
    .select()
    .from(schema.friendships)
    .where(or(inArray(schema.friendships.requesterId, [a.id, b.id]), inArray(schema.friendships.addresseeId, [a.id, b.id])));

describe("friend requests", () => {
  it("a reverse request accepts instead of duplicating", async () => {
    expect(await friendsService.request(a.publicId, b.publicId)).toBe("outgoing");
    expect((await friendsService.list(b.publicId)).incoming.map((p) => p.publicId)).toEqual([a.publicId]);
    expect(await friendsService.request(b.publicId, a.publicId)).toBe("friends");
    expect((await friendsService.list(a.publicId)).friends.map((p) => p.publicId)).toEqual([b.publicId]);
  });

  it("simultaneous requests end as one accepted row", async () => {
    await Promise.all([friendsService.request(a.publicId, b.publicId), friendsService.request(b.publicId, a.publicId)]);
    const rows = await pairRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("accepted");
  });

  it("decline removes the request; remove ends a friendship", async () => {
    await friendsService.request(a.publicId, b.publicId);
    await friendsService.decline(b.publicId, a.publicId);
    expect(await pairRows()).toHaveLength(0);
    await friendsService.request(a.publicId, b.publicId);
    await friendsService.accept(b.publicId, a.publicId);
    expect((await friendsService.list(a.publicId)).friends).toHaveLength(1);
    await friendsService.remove(a.publicId, b.publicId);
    expect(await pairRows()).toHaveLength(0);
  });

  it("cannot add yourself or staff", async () => {
    await expect(friendsService.request(a.publicId, a.publicId)).rejects.toThrow(/yourself/);
    await expect(friendsService.request(a.publicId, staff.publicId)).rejects.toThrow(/couldn't find/);
  });
});

describe("search", () => {
  it("finds a customer by exact username only, never staff, the viewer or email", async () => {
    const rows = await friendsService.search(a.publicId, "@FriendsIt_Ben");
    expect(rows.map((r) => r.publicId)).toEqual([b.publicId]);
    // No partial matches: a prefix would let someone page through customers.
    expect(await friendsService.search(a.publicId, "friendsit_")).toEqual([]);
    expect(await friendsService.search(a.publicId, "friendsit_staff")).toEqual([]);
    expect(await friendsService.search(a.publicId, "friendsit_ana")).toEqual([]);
    expect(Object.keys(rows[0]!).sort()).toEqual(["displayUsername", "image", "name", "publicId", "relation"]);
    // Names are not searchable: a substring would page through every customer.
    expect(await friendsService.search(a.publicId, `${MARK} c`)).toEqual([]);
  });

  it("shows the relation and ignores queries under 3 characters", async () => {
    await friendsService.request(a.publicId, b.publicId);
    expect((await friendsService.search(a.publicId, "friendsit_ben"))[0]!.relation).toBe("outgoing");
    expect((await friendsService.search(b.publicId, "friendsit_ana"))[0]!.relation).toBe("incoming");
    expect(await friendsService.search(a.publicId, "fr")).toEqual([]);
  });

  it("treats % and _ as plain text", async () => {
    expect(await friendsService.search(a.publicId, "%%")).toEqual([]);
  });
});

describe("invite links", () => {
  it("a signed ref makes two families friends", async () => {
    const ref = await friendsService.inviteRef(a.publicId);
    expect(ref).toMatch(/^friendsit_ana-[0-9a-f]{12}$/);
    expect(await friendsService.acceptInvite(b.publicId, ref!)).toBe(true);
    expect((await friendsService.list(a.publicId)).friends.map((p) => p.publicId)).toEqual([b.publicId]);
  });

  it("ignores bare usernames, forged, staff and own refs", async () => {
    expect(await friendsService.acceptInvite(b.publicId, "friendsit_ana")).toBe(false);
    expect(await friendsService.acceptInvite(b.publicId, "friendsit_ana-000000000000")).toBe(false);
    expect(await friendsService.acceptInvite(b.publicId, (await friendsService.inviteRef(staff.publicId))!)).toBe(false);
    expect(await friendsService.acceptInvite(a.publicId, (await friendsService.inviteRef(a.publicId))!)).toBe(false);
    expect(await friendsService.acceptInvite(b.publicId, "<script>")).toBe(false);
    expect(await pairRows()).toHaveLength(0);
  });

  it("settles a pending request the other way", async () => {
    await friendsService.request(b.publicId, a.publicId);
    expect(await friendsService.acceptInvite(b.publicId, (await friendsService.inviteRef(a.publicId))!)).toBe(true);
    const rows = await pairRows();
    expect(rows.map((r) => r.status)).toEqual(["accepted"]);
  });

  it("previews who invited you without writing anything", async () => {
    const ref = (await friendsService.inviteRef(a.publicId))!;
    expect(await friendsService.previewInvite(b.publicId, ref)).toMatchObject({ publicId: a.publicId, displayUsername: "friendsit_ana" });
    expect(await friendsService.previewInvite(a.publicId, ref)).toBeNull();
    expect(await friendsService.previewInvite(b.publicId, "friendsit_ana-000000000000")).toBeNull();
    expect(await pairRows()).toHaveLength(0);
  });

  it("has no ref until there is a username", async () => {
    expect(await friendsService.inviteRef(c.publicId)).toBeNull();
  });
});

describe("usernames", () => {
  it("are unique regardless of case", async () => {
    await friendsService.setUsername(c.publicId, "FriendsIt_Cy");
    await expect(friendsService.setUsername(b.publicId, "friendsit_cy")).rejects.toThrow(/already taken/);
    await expect(friendsService.setUsername(b.publicId, "no spaces")).rejects.toThrow(/3–30/);
  });

  it("cannot be cleared (an empty one would just be refilled on the next /me load)", async () => {
    await expect(friendsService.setUsername(a.publicId, "  ")).rejects.toThrow(/required/i);
    await expect(friendsService.setUsername(a.publicId, null)).rejects.toThrow(/required/i);
  });

  it("request returns friends when they had already asked", async () => {
    await friendsService.request(b.publicId, a.publicId);
    expect(await friendsService.request(a.publicId, b.publicId)).toBe("friends");
  });

  it("ensureUsername fills a missing one and keeps an existing one", async () => {
    const name = await friendsService.ensureUsername(c.publicId);
    expect(name).toMatch(/^user_[a-z0-9]{8}$/);
    expect(await friendsService.ensureUsername(c.publicId)).toBe(name);
    expect(await friendsService.ensureUsername(a.publicId)).toBe("friendsit_ana");
  });
});
