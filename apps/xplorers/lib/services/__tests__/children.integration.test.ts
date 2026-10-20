import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inArray, like } from "drizzle-orm";

let actor: bigint | null = null;
vi.mock("@/lib/services/session-service", async (orig) => ({
  ...(await orig<typeof import("@/lib/services/session-service")>()),
  currentUserId: async () => actor,
}));
vi.mock("@/lib/services/app-settings.service", async (orig) => ({
  ...(await orig<typeof import("@/lib/services/app-settings.service")>()),
  getAppClock: async () => ({ timezone: "America/Toronto", currency: "CAD" }),
}));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { childrenService } = await import("../children.service");
const { addDayKey, dayKey } = await import("@/lib/sessions/timezone");

const MARK = "children-it";
let a: bigint, b: bigint;

async function cleanup() {
  const ids = (await db.select({ id: schema.users.id }).from(schema.users).where(like(schema.users.email, `${MARK}-%`))).map((r) => r.id);
  if (!ids.length) return;
  await db.delete(schema.children).where(inArray(schema.children.userId, ids));
  await db.delete(schema.users).where(inArray(schema.users.id, ids));
}

beforeEach(async () => {
  await cleanup();
  const mk = async (n: string) =>
    (await db.insert(schema.users).values({ name: MARK, email: `${MARK}-${n}@example.test`, role: "user" }).returning({ id: schema.users.id }))[0]!.id;
  a = await mk("a");
  b = await mk("b");
  actor = a;
});
afterEach(cleanup);

describe("childrenService", () => {
  it("createMine stamps the session user as owner and listMine returns only own", async () => {
    const mine = await childrenService.createMine({ name: "Mia", dateOfBirth: "2021-05-01" });
    expect(mine.userId).toBe(a);
    actor = b;
    await childrenService.createMine({ name: "Bo", dateOfBirth: "2020-01-01" });
    expect((await childrenService.listMine()).map((c) => c.name)).toEqual(["Bo"]);
    actor = a;
    expect((await childrenService.listMine()).map((c) => c.name)).toEqual(["Mia"]);
  });

  it("rejects a future DOB, a bad DOB and a blank name", async () => {
    const tomorrow = addDayKey(dayKey(new Date(), "America/Toronto"), 1);
    await expect(childrenService.createMine({ name: "X", dateOfBirth: tomorrow })).rejects.toThrow();
    await expect(childrenService.createMine({ name: "X", dateOfBirth: "nope" })).rejects.toThrow();
    await expect(childrenService.createMine({ name: " ", dateOfBirth: "2020-01-01" })).rejects.toThrow();
  });

  it("requires a signed-in user", async () => {
    actor = null;
    await expect(childrenService.listMine()).rejects.toThrow();
  });
});
