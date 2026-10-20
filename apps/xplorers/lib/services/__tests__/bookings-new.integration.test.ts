import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { bookReq, flatPrice, PRICED_PRICING, pricedWindow, type TestOccurrence } from "./test-fixtures";

const cash = { id: "cash", kind: "manual" as const, enabled: true, label: "Cash", taxes: [] };

vi.mock("@/lib/services/app-settings.service", async (orig) => ({
  ...(await orig<typeof import("@/lib/services/app-settings.service")>()),
  getPaymentConfig: async () => ({ methods: [cash] }),
  getAppClock: async () => ({ timezone: "America/Toronto", currency: "CAD" }),
  getDiscountSettings: async () => ({ maxDiscountPct: 100 }),
  getMaxWalletBalance: async () => null,
}));
vi.mock("@/lib/services/payments.service", async (orig) => {
  const mod = await orig<typeof import("@/lib/services/payments.service")>();
  mod.paymentsService.enabledRails = async () => [cash];
  return mod;
});

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { bookingsService } = await import("../bookings.service");
const { getDefaultPrices } = await import("../app-settings.service");
const { dayTypeOf } = await import("@/lib/pricing/resolve");

const MARK = "bk-new-it";
let fams: { id: bigint; publicId: string }[];
let kids: string[][];
let classIds: bigint[] = [];
let parkedDiscountIds: bigint[] = [];

async function makeOccurrence(opts: {
  capacity?: number;
  days?: number;
  classValues?: Partial<typeof schema.studioSessions.$inferInsert>;
  occValues?: Partial<typeof schema.studioSessionOccurrences.$inferInsert>;
} = {}): Promise<TestOccurrence> {
  const startsAt = new Date(Date.now() + (opts.days ?? 7) * 86_400_000);
  const [s] = await db
    .insert(schema.studioSessions)
    .values({
      title: `${MARK} class`,
      category: "kids",
      capacity: 10,
      pricing: { ...PRICED_PRICING, extension: { stepMinutes: 30, price: { weekday: 5, weekend: 5 } }, adults: { free: 1, extraPrice: { weekday: 7, weekend: 7 } } },
      prices: flatPrice("20.00"),
      published: true,
      ...opts.classValues,
    })
    .returning({ id: schema.studioSessions.id });
  classIds.push(s!.id);
  const [occ] = await db
    .insert(schema.studioSessionOccurrences)
    .values({
      sessionId: s!.id,
      occursOn: startsAt.toISOString().slice(0, 10),
      ...pricedWindow(startsAt, opts.capacity ?? 10),
      ...opts.occValues,
    })
    .returning({ publicId: schema.studioSessionOccurrences.publicId, startsAt: schema.studioSessionOccurrences.startsAt });
  return { publicId: occ!.publicId, startsAt: occ!.startsAt };
}

beforeEach(async () => {
  parkedDiscountIds = (
    await db.update(schema.discounts).set({ active: false }).where(eq(schema.discounts.active, true)).returning({ id: schema.discounts.id })
  ).map((d) => d.id);
  fams = await db
    .insert(schema.users)
    .values([1, 2, 3].map((i) => ({ name: `${MARK} ${i}`, email: `${MARK}-${i}@example.test`, role: "user" as const })))
    .returning({ id: schema.users.id, publicId: schema.users.publicId });
  const rows = await db
    .insert(schema.children)
    .values(fams.flatMap((f, i) => [0, 1].map((j) => ({ userId: f.id, name: `${MARK} kid ${i}${j}`, dateOfBirth: "2020-01-01" }))))
    .returning({ publicId: schema.children.publicId, userId: schema.children.userId });
  kids = fams.map((f) => rows.filter((r) => r.userId === f.id).map((r) => r.publicId));
  classIds = [];
});

afterEach(async () => {
  const userIds = fams.map((f) => f.id);
  await db.delete(schema.ledgerEntries).where(inArray(schema.ledgerEntries.userId, userIds));
  await db.delete(schema.payments).where(inArray(schema.payments.userId, userIds));
  const bk = await db.select({ id: schema.bookings.id, publicId: schema.bookings.publicId }).from(schema.bookings).where(inArray(schema.bookings.userId, userIds));
  if (bk.length) {
    await db.delete(schema.bookingChildren).where(inArray(schema.bookingChildren.bookingId, bk.map((b) => b.id)));
    await db.delete(schema.auditLog).where(inArray(schema.auditLog.entityPublicId, bk.map((b) => b.publicId)));
    await db.delete(schema.bookings).where(inArray(schema.bookings.id, bk.map((b) => b.id)));
  }
  await db.delete(schema.children).where(inArray(schema.children.userId, userIds));
  if (classIds.length) {
    await db.delete(schema.studioSessionOccurrences).where(inArray(schema.studioSessionOccurrences.sessionId, classIds));
    await db.delete(schema.studioSessions).where(inArray(schema.studioSessions.id, classIds));
  }
  await db.delete(schema.users).where(like(schema.users.email, `${MARK}-%`));
  if (parkedDiscountIds.length) {
    await db.update(schema.discounts).set({ active: true }).where(inArray(schema.discounts.id, parkedDiscountIds));
  }
});

describe("createForUser on the new model", () => {
  it("rejects a start that runs past the window end, server side", async () => {
    const occ = await makeOccurrence();
    const late = new Date(occ.startsAt.getTime() + 120 * 60_000).toISOString();
    await expect(bookingsService.createForUser(fams[0]!.publicId, bookReq(occ, [kids[0]![0]!], { startsAt: late }))).rejects.toThrow(/past the class window/);
  });

  it("fills capacity by children: 2+2 fit a cap of 4, one more is refused", async () => {
    const occ = await makeOccurrence({ capacity: 4 });
    await bookingsService.createForUser(fams[0]!.publicId, bookReq(occ, kids[0]!));
    const otherStart = new Date(occ.startsAt.getTime() + 30 * 60_000).toISOString();
    await bookingsService.createForUser(fams[1]!.publicId, bookReq(occ, kids[1]!, { startsAt: otherStart }));
    await expect(bookingsService.createForUser(fams[2]!.publicId, bookReq(occ, [kids[2]![0]!]))).rejects.toThrow("This session is full.");
  });

  it("says how many places are left", async () => {
    const occ = await makeOccurrence({ capacity: 3 });
    await bookingsService.createForUser(fams[0]!.publicId, bookReq(occ, kids[0]!));
    await expect(bookingsService.createForUser(fams[1]!.publicId, bookReq(occ, kids[1]!))).rejects.toThrow("Only 1 place left.");
  });

  it("stores the server price per child, the window, the option and the add-ons", async () => {
    const occ = await makeOccurrence();
    const b = await bookingsService.createForUser(
      fams[0]!.publicId,
      bookReq(occ, kids[0]!, { extensionSteps: 1, adults: 2, total: 1, amount: 1 }),
    );
    // 2 children x (20 + 5) + 1 extra adult x 7
    expect(b.pricing).toMatchObject({ subtotal: 57, total: 57 });
    expect(b.status).toBe("pending");
    expect(b.seats).toBe(2);
    expect(b.adults).toBe(2);
    expect(b.extensionSteps).toBe(1);
    expect(b.optionKey).toBeNull();
    expect(b.lengthMinutes).toBe(120);
    expect(b.startsAt.getTime()).toBe(occ.startsAt.getTime());
    expect(b.endsAt.getTime()).toBe(occ.startsAt.getTime() + 120 * 60_000);
    const links = await db.select().from(schema.bookingChildren).where(eq(schema.bookingChildren.bookingId, b.id));
    expect(links).toHaveLength(2);
    const [pay] = await db.select().from(schema.payments).where(eq(schema.payments.bookingId, b.id));
    expect(pay!.amount).toBe("57.00");
  });

  it("quote() is read-only and matches what the booking charges", async () => {
    const occ = await makeOccurrence();
    const req = bookReq(occ, kids[0]!, { extensionSteps: 1, adults: 2 });
    const q = await bookingsService.quote(req as never, fams[0]!.publicId);
    expect(await db.select().from(schema.bookings).where(eq(schema.bookings.userId, fams[0]!.id))).toHaveLength(0);
    const b = await bookingsService.createForUser(fams[0]!.publicId, req as never);
    expect(q.subtotal).toBe(b.pricing!.subtotal);
    expect(q.total).toBe(b.pricing!.total);
  });

  describe("price layers", () => {
    const ask = async (classPrices: unknown, occPrices?: unknown) => {
      const occ = await makeOccurrence({
        classValues: { prices: classPrices as never },
        occValues: occPrices ? { prices: occPrices as never } : {},
      });
      const q = await bookingsService.quote(bookReq(occ, [kids[0]![0]!], { choice: { kind: "length", minutes: 120 } }) as never, fams[0]!.publicId);
      return { q, occ };
    };

    it("falls back to the global table when the class sets no price", async () => {
      const { q, occ } = await ask(null);
      const day = dayTypeOf(occ.startsAt.toISOString().slice(0, 10));
      expect(q.perChild).toBe((await getDefaultPrices())["len:120"]![day]);
    });

    it("the class price beats the global one", async () => {
      const { q } = await ask(flatPrice(11, "len:120"));
      expect(q.perChild).toBe(11);
    });

    it("a date override beats the class price", async () => {
      const { q } = await ask(flatPrice(11, "len:120"), flatPrice(7, "len:120"));
      expect(q.perChild).toBe(7);
    });
  });

  it("records a waiver per child and blocks out-of-range children without one", async () => {
    const waiverOcc = await makeOccurrence({ classValues: { ageMin: 9, ageMax: 12, ageWaiver: true } });
    const b = await bookingsService.createForUser(fams[0]!.publicId, bookReq(waiverOcc, [kids[0]![0]!]));
    const [link] = await db.select().from(schema.bookingChildren).where(eq(schema.bookingChildren.bookingId, b.id));
    expect(link!.waiverUsed).toBe(true);
    const [staffRow] = await bookingsService.listForOccurrence(waiverOcc.publicId);
    expect(staffRow!.children).toEqual([`${MARK} kid 00 (age waiver)`]);

    const strictOcc = await makeOccurrence({ classValues: { ageMin: 9, ageMax: 12, ageWaiver: false } });
    await expect(bookingsService.createForUser(fams[1]!.publicId, bookReq(strictOcc, [kids[1]![0]!]))).rejects.toThrow(/kid 10 is outside the age range/);
  });

  it("refuses a second open booking by the same family on a session", async () => {
    const occ = await makeOccurrence();
    await bookingsService.createForUser(fams[0]!.publicId, bookReq(occ, [kids[0]![0]!]));
    await expect(bookingsService.createForUser(fams[0]!.publicId, bookReq(occ, [kids[0]![1]!]))).rejects.toThrow(/already booked/);
  });

  it("refuses cancelled, enquire-only, unpublished, archived and started sessions", async () => {
    const book = (occ: TestOccurrence) => bookingsService.createForUser(fams[0]!.publicId, bookReq(occ, [kids[0]![0]!]));
    await expect(book(await makeOccurrence({ occValues: { status: "cancelled" } }))).rejects.toThrow("This session was cancelled.");
    await expect(book(await makeOccurrence({ classValues: { bookingType: "enquire_only" } }))).rejects.toThrow(/enquiry/);
    await expect(book(await makeOccurrence({ classValues: { published: false } }))).rejects.toThrow(/not open/);
    await expect(book(await makeOccurrence({ classValues: { archived: true } }))).rejects.toThrow(/no longer offered/);
    await expect(book(await makeOccurrence({ days: -1 }))).rejects.toThrow(/already started/);
  });

  it("refuses a priced class when no payment method is enabled, instead of booking it free", async () => {
    const { paymentsService } = await import("../payments.service");
    const rails = paymentsService.enabledRails;
    paymentsService.enabledRails = async () => [];
    try {
      const occ = await makeOccurrence();
      const req = bookReq(occ, [kids[0]![0]!]);
      await expect(bookingsService.quote(req, fams[0]!.publicId)).rejects.toThrow(/payment isn't set up/);
      await expect(bookingsService.createForUser(fams[0]!.publicId, req)).rejects.toThrow(/payment isn't set up/);
      const free = await makeOccurrence({ classValues: { prices: flatPrice("0.00") } });
      const b = await bookingsService.createForUser(fams[0]!.publicId, bookReq(free, [kids[0]![0]!]));
      expect(b.status).toBe("confirmed");
    } finally {
      paymentsService.enabledRails = rails;
    }
  });

  it("validates adults, extension and children at the boundary", async () => {
    const occ = await makeOccurrence();
    const go = (extra: Record<string, unknown>, ids = [kids[0]![0]!]) =>
      bookingsService.createForUser(fams[0]!.publicId, bookReq(occ, ids, extra));
    await expect(go({ adults: -1 })).rejects.toThrow(/Adults/);
    await expect(go({ adults: 1.5 })).rejects.toThrow(/Adults/);
    await expect(go({ extensionSteps: -1 })).rejects.toThrow(/Extension/);
    await expect(go({}, [])).rejects.toThrow(/at least one child/);
    await expect(go({}, [kids[0]![0]!, kids[0]![0]!])).rejects.toThrow(/only be picked once/);
    await expect(go({}, [kids[1]![0]!])).rejects.toThrow(/your own children/);
  });
});
