import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { TEST_PRICING } from "./test-fixtures";

vi.mock("@/lib/services/app-settings.service", async (orig) => ({
  ...(await orig<typeof import("@/lib/services/app-settings.service")>()),
  getAppClock: async () => ({ timezone: "America/Toronto", currency: "CAD" }),
}));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { studioSessionsService } = await import("../studio-sessions.service");
const { dayKey, addDayKey } = await import("@/lib/sessions/timezone");

const MARK = "list-range-it";
const today = dayKey(new Date(), "America/Toronto");
const occ = schema.studioSessionOccurrences;
const classIds: bigint[] = [];
const classPublicIds = new Map<bigint, string>();

const pattern = {
  weekdays: [1, 2, 3, 4, 5, 6, 7],
  nthOfMonth: null,
  startClock: "09:30",
  endClock: "10:30",
  startsOn: today,
  endsOn: null,
  excludeMonths: [],
};

async function makeClass(over: Partial<typeof schema.studioSessions.$inferInsert>) {
  const [c] = await db
    .insert(schema.studioSessions)
    .values({ title: `${MARK}-${classIds.length}`, category: "kids", capacity: 5, pricing: TEST_PRICING, pattern, published: true, ...over })
    .returning({ id: schema.studioSessions.id, publicId: schema.studioSessions.publicId });
  classIds.push(c!.id);
  classPublicIds.set(c!.id, c!.publicId);
  return c!.id;
}

beforeEach(() => {
  classIds.length = 0;
});

afterEach(async () => {
  for (const id of classIds) {
    await db.delete(occ).where(eq(occ.sessionId, id));
    await db.delete(schema.studioSessions).where(eq(schema.studioSessions.id, id));
  }
});

describe("studioSessionsService.listRange", () => {
  it("materialises the horizon and returns colour and status; publicOnly hides cancelled, unpublished, archived and enquire-only", async () => {
    const shown = await makeClass({ color: "sky" });
    const hidden = await makeClass({ published: false });
    const archived = await makeClass({ archived: true });
    const enquire = await makeClass({ bookingType: "enquire_only" });
    const cancelledClass = await makeClass({ color: "green" });
    const to = addDayKey(today, 2);

    await studioSessionsService.ensureHorizon(classPublicIds.get(cancelledClass));
    const [victim] = await db.select().from(occ).where(eq(occ.sessionId, cancelledClass)).limit(1);
    await db.update(occ).set({ status: "cancelled" }).where(eq(occ.id, victim!.id));

    const adminAfter = await studioSessionsService.listRange(today, to, { publicOnly: false });
    const ofClass = (rows: typeof adminAfter, id: bigint) => rows.filter((r) => r.classPublicId === classPublicIds.get(id));

    expect(ofClass(adminAfter, shown).length).toBe(3);
    expect(ofClass(adminAfter, shown)[0]).toMatchObject({ color: "sky", status: "scheduled" });
    expect(ofClass(adminAfter, hidden).length).toBe(3);
    expect(ofClass(adminAfter, archived).length).toBe(0);
    expect(ofClass(adminAfter, cancelledClass).filter((r) => r.status === "cancelled").length).toBe(1);

    const pub = await studioSessionsService.listRange(today, to, { publicOnly: true });
    expect(ofClass(pub, shown).length).toBe(3);
    expect(ofClass(pub, hidden).length).toBe(0);
    expect(ofClass(pub, enquire).length).toBe(0);
    expect(ofClass(pub, cancelledClass).length).toBe(2);
    expect(ofClass(pub, cancelledClass).every((r) => r.status === "scheduled")).toBe(true);
  });
});
