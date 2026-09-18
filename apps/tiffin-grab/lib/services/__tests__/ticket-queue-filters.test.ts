import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ne } from "drizzle-orm";

// Staff session: listForQueue is staff-only reading, and the filters are the
// contract complaint analytics links through.
vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { ticketMessages, tickets, users } = await import("@/db/schema");
const { ticketsService } = await import("../tickets.service");
const { parseComplaintFilters, complaintHref } = await import("../analytics/complaint-filters");

const now = Date.now();
const DAY = 24 * 60 * 60 * 1000;

async function reset() {
  await db.delete(ticketMessages);
  await db.delete(tickets);
  await db.delete(users).where(ne(users.isSystem, true));
}

async function seed() {
  const [u] = await db
    .insert(users)
    .values({ email: `q${Math.random().toString(36).slice(2)}@x.test`, name: "Q", role: "user" })
    .returning();
  const mk = async (over: Record<string, unknown>) => {
    const [t] = await db
      .insert(tickets)
      .values({
        raisedBy: u!.id,
        subject: "t",
        category: "delivery",
        subcategory: "late_delivery",
        status: "open",
        priority: "normal",
        createdAt: now,
        ...over,
      } as never)
      .returning();
    await db.insert(ticketMessages).values({
      ticketId: t!.id,
      authorId: u!.id,
      authorType: "customer",
      body: "hi",
      createdAt: now,
    });
    return t!;
  };
  return { user: u!, mk };
}

describe("ticket queue honours complaint filters", () => {
  beforeEach(reset);
  afterAll(reset);

  it("filters by category and sub-category, the way a drill-through links", async () => {
    const { mk } = await seed();
    await mk({ category: "delivery", subcategory: "late_delivery" });
    await mk({ category: "delivery", subcategory: "not_delivered" });
    await mk({ category: "packaging", subcategory: "leaking" });

    const filters = parseComplaintFilters({ category: "delivery", subcategory: "late_delivery" });
    const rows = await ticketsService.listForQueue(undefined, filters);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.category).toBe("delivery");
  });

  it("filters by priority and status", async () => {
    const { mk } = await seed();
    await mk({ priority: "urgent", status: "open" });
    await mk({ priority: "low", status: "open" });
    await mk({ priority: "urgent", status: "closed" });

    const urgentOpen = await ticketsService.listForQueue(
      undefined,
      parseComplaintFilters({ priority: "urgent", status: "open" }),
    );
    expect(urgentOpen).toHaveLength(1);
  });

  it("filters by the derived New status — open with no staff reply", async () => {
    const { user, mk } = await seed();
    const answered = await mk({ status: "open" });
    await db.insert(ticketMessages).values({
      ticketId: answered.id,
      authorId: user.id,
      authorType: "staff",
      body: "on it",
      createdAt: now,
    });
    await mk({ status: "open" }); // never answered

    const isNew = await ticketsService.listForQueue(undefined, parseComplaintFilters({ status: "new" }));
    expect(isNew).toHaveLength(1);
  });

  it("filters by date range", async () => {
    const { mk } = await seed();
    await mk({ createdAt: now - 10 * DAY });
    await mk({ createdAt: now });

    const recent = await ticketsService.listForQueue(
      undefined,
      parseComplaintFilters({ from: String(now - 2 * DAY) }),
    );
    expect(recent).toHaveLength(1);
  });

  it("returns everything when no filters are passed, exactly as before", async () => {
    const { mk } = await seed();
    await mk({});
    await mk({ category: "feedback", subcategory: "compliment" });
    // The queue is not complaint-only: feedback tickets still need working.
    expect(await ticketsService.listForQueue()).toHaveLength(2);
    expect(await ticketsService.listForQueue(undefined, parseComplaintFilters({}))).toHaveLength(2);
  });

  it("lands on the same rows a dashboard link encodes", async () => {
    // End-to-end on the contract itself: build the href the chart renders, parse
    // it back the way the queue page does, and check the queue agrees.
    const { mk } = await seed();
    await mk({ category: "food_meal", subcategory: "food_quality", priority: "high" });
    await mk({ category: "food_meal", subcategory: "food_quantity", priority: "low" });

    const href = complaintHref("/dashboard/tickets", {
      categories: ["food_meal"],
      subcategories: ["food_quality"],
    });
    const sp = Object.fromEntries(new URL(href, "http://x").searchParams) as Record<string, string>;
    const rows = await ticketsService.listForQueue(undefined, parseComplaintFilters(sp));
    expect(rows).toHaveLength(1);
  });
});
