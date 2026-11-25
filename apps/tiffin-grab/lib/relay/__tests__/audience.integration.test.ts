// @vitest-db
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { customerGroupMembers, customerGroups, users } from "@/db/schema";
import { resolveAudiencePage } from "@/lib/relay/audience";
import { POST } from "@/app/api/relay/audience/route";

const MARK = "aud-int";
const userIds: bigint[] = [];
let groupId: bigint;
let groupPublicId: string;

async function makeUser(tag: string, over: Partial<typeof users.$inferInsert> = {}): Promise<bigint> {
  const [u] = await db
    .insert(users)
    .values({ name: `${MARK} ${tag}`, email: `${MARK}-${tag}@example.test`, role: "user", status: "active", ...over })
    .returning({ id: users.id });
  userIds.push(u!.id);
  return u!.id;
}

beforeAll(async () => {
  vi.stubEnv("CRON_SECRET", "s3cret");
  const good = [await makeUser("a"), await makeUser("b"), await makeUser("c")];
  const excluded = [
    await makeUser("inactive", { status: "suspended" }),
    await makeUser("optout", { notifyEmail: false }),
    await makeUser("noemail", { email: "" }),
  ];
  const [g] = await db.insert(customerGroups).values({ name: `${MARK} group`, filters: {} }).returning({ id: customerGroups.id, publicId: customerGroups.publicId });
  groupId = g!.id;
  groupPublicId = g!.publicId;
  await db.insert(customerGroupMembers).values([...good, ...excluded].map((userId) => ({ groupId, userId })));
});

afterAll(async () => {
  if (!userIds.length) return;
  await db.delete(customerGroupMembers).where(eq(customerGroupMembers.groupId, groupId));
  await db.delete(customerGroups).where(eq(customerGroups.id, groupId));
  await db.delete(users).where(inArray(users.id, userIds));
});

describe("resolveAudiencePage", () => {
  it("pages by user id and drops inactive, notify-off and no-email customers", async () => {
    const audience = `group:${groupPublicId}`;
    const emails: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = await resolveAudiencePage(audience, cursor, 1);
      expect(page.recipients.length).toBeLessThanOrEqual(1);
      emails.push(...page.recipients.map((r) => r.email));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor !== null && pages < 10);
    expect(pages).toBe(3);
    expect(emails).toEqual(["aud-int-a@example.test", "aud-int-b@example.test", "aud-int-c@example.test"]);
  });

  it("returns implied consent with the name split at the first space", async () => {
    const page = await resolveAudiencePage(`group:${groupPublicId}`, null, 500);
    expect(page.nextCursor).toBeNull();
    expect(page.recipients[0]).toEqual({
      email: "aud-int-a@example.test",
      firstName: "aud-int",
      lastName: "a",
      consent: "implied",
      consentAt: expect.any(Number),
    });
  });

  it("returns an empty page for an unknown audience string", async () => {
    expect(await resolveAudiencePage("bogus", null, 500)).toEqual({ recipients: [], nextCursor: null });
  });

  it("returns an empty page for a cursor that is not an id", async () => {
    expect(await resolveAudiencePage(`group:${groupPublicId}`, "x", 500)).toEqual({ recipients: [], nextCursor: null });
  });
});

describe("POST /api/relay/audience", () => {
  const req = (auth?: string) =>
    new Request("https://internal/api/relay/audience", {
      method: "POST",
      headers: auth ? { authorization: auth, "content-type": "application/json" } : { "content-type": "application/json" },
      body: JSON.stringify({ type: "audience.page", audience: `group:${groupPublicId}`, cursor: null, limit: 500 }),
    });

  it("401s without the internal bearer", async () => {
    expect((await POST(req())).status).toBe(401);
  });

  it("answers with the page for the internal bearer", async () => {
    const res = await POST(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { recipients: unknown[]; nextCursor: unknown };
    expect(body.recipients).toHaveLength(3);
    expect(body.nextCursor).toBeNull();
  });
});
