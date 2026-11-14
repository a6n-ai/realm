import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationOutbox, ownerPool, ticketMessages, tickets, users } from "@/db/schema";
import { ForbiddenError, NotFoundError, ValidationError } from "@foundry/commons";

const session: { user: { id: string; role: string } | null } = { user: null };
vi.mock("@/lib/auth/session", () => ({ getSession: async () => (session.user ? session : null) }));
let visible: "all" | string[] = "all";
vi.mock("@/lib/auth/visible-orgs", () => ({ resolveSessionVisibleOrgIds: async () => visible }));

const { ticketsService } = await import("../tickets.service");
const { resetPoolCache } = await import("../../staff/owner-pool.service");

const seededUserIds: bigint[] = [];

async function seedUser(name: string, role: "user" | "member" | "admin") {
  const [u] = await db.insert(users).values({ email: `u${Math.random().toString(36).slice(2)}@test.invalid`,  name, role }).returning({ id: users.id, publicId: users.publicId });
  seededUserIds.push(u.id);
  return u;
}

function actAs(user: { publicId: string }, role: "user" | "member" | "admin") {
  session.user = { id: user.publicId, role };
}

async function reset() {
  await db.delete(ticketMessages);
  await db.delete(tickets);
  session.user = null;
  visible = "all";
}

describe("ticketsService", () => {
  beforeEach(reset);

  afterAll(async () => {
    await db.delete(ticketMessages);
    await db.delete(tickets);
    if (seededUserIds.length) {
      await db.delete(notificationOutbox).where(inArray(notificationOutbox.recipientId, seededUserIds));
      await db.delete(users).where(inArray(users.id, seededUserIds));
    }
  });

  it("create inserts an open ticket and a first customer message", async () => {
    const customer = await seedUser("Cust Create", "user");
    actAs(customer, "user");

    const ticket = await ticketsService.create({ subject: "Where is my order?", category: "order", subcategory: "order_missing", body: "It never arrived." });
    expect(ticket.status).toBe("open");
    expect(ticket.raisedBy).toBe(customer.id);

    const messages = await ticketsService.listMessages(ticket.publicId);
    expect(messages).toHaveLength(1);
    expect(messages[0].authorType).toBe("customer");
    expect(messages[0].body).toBe("It never arrived.");
  });

  it("rejects a customer reply on a resolved ticket (no silent reopen)", async () => {
    const customer = await seedUser("Cust Locked", "user");
    const staff = await seedUser("Staff Locked", "admin");

    actAs(customer, "user");
    const ticket = await ticketsService.create({ subject: "Billing", category: "billing", subcategory: "payment_failed", body: "Charged twice." });

    actAs(staff, "admin");
    await ticketsService.changeStatus(ticket.publicId, "resolved");

    actAs(customer, "user");
    await expect(ticketsService.reply(ticket.publicId, "Still wrong")).rejects.toThrow(ForbiddenError);

    const [row] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
    expect(row.status).toBe("resolved");
  });

  it("hides a ticket from staff outside its organization", async () => {
    const customer = await seedUser("Cust Other Org", "user");
    const staff = await seedUser("Staff Other Org", "member");

    actAs(customer, "user");
    const ticket = await ticketsService.create({ subject: "Scoped", category: "general", subcategory: "something_else", body: "Hi" });

    actAs(staff, "member");
    visible = ["org_other_franchise"];
    await expect(ticketsService.readForStaff(ticket.publicId)).rejects.toThrow(NotFoundError);
    await expect(ticketsService.changeStatus(ticket.publicId, "closed")).rejects.toThrow(NotFoundError);
    await expect(ticketsService.reply(ticket.publicId, "Hello")).rejects.toThrow(NotFoundError);
    expect((await ticketsService.listQueuePage(undefined, undefined, { page: { page: 0, size: 25 }, visible })).total).toBe(0);
  });

  it("rejects a staff reply on a closed ticket", async () => {
    const customer = await seedUser("Cust Closed", "user");
    const staff = await seedUser("Staff Closed", "member");

    actAs(customer, "user");
    const ticket = await ticketsService.create({ subject: "Closed", category: "general", subcategory: "something_else", body: "Done?" });

    actAs(staff, "member");
    await ticketsService.changeStatus(ticket.publicId, "closed");
    await expect(ticketsService.reply(ticket.publicId, "One more thing")).rejects.toThrow(ForbiddenError);
  });

  it("staff reopen (changeStatus to open) clears closedAt and lets replies resume", async () => {
    const customer = await seedUser("Cust Resume", "user");
    const staff = await seedUser("Staff Resume", "admin");

    actAs(customer, "user");
    const ticket = await ticketsService.create({ subject: "Resume", category: "order", subcategory: "order_missing", body: "Where?" });

    actAs(staff, "admin");
    await ticketsService.changeStatus(ticket.publicId, "resolved");
    await ticketsService.changeStatus(ticket.publicId, "open");

    const [reopened] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
    expect(reopened.status).toBe("open");
    expect(reopened.closedAt).toBeNull();

    actAs(customer, "user");
    await ticketsService.reply(ticket.publicId, "Thanks, still waiting");
    const messages = await ticketsService.listMessages(ticket.publicId);
    expect(messages.at(-1)?.body).toBe("Thanks, still waiting");
  });

  it("allows an image-only reply (empty body with an attachment)", async () => {
    const customer = await seedUser("Cust Img", "user");
    actAs(customer, "user");
    const ticket = await ticketsService.create({ subject: "Photo", category: "order", subcategory: "order_missing", body: "See photo." });
    await ticketsService.reply(ticket.publicId, "", [
      { path: "tickets/x/orig-a.png", thumbUrl: "https://x/thumb-a.png", name: "a.png" },
    ]);
    const messages = await ticketsService.listMessages(ticket.publicId);
    expect(messages.at(-1)?.attachments).toEqual([
      { path: "tickets/x/orig-a.png", thumbUrl: "https://x/thumb-a.png", name: "a.png" },
    ]);
  });

  it("setOpeningAttachments updates the first customer message", async () => {
    const customer = await seedUser("Cust Open Img", "user");
    actAs(customer, "user");
    const ticket = await ticketsService.create({
      subject: "With screenshot",
      category: "order", subcategory: "order_missing",
      body: "See attached.",
    });
    const att = [{ path: "tickets/y/orig-b.png", thumbUrl: "https://x/thumb-b.png", name: "b.png" }];
    await ticketsService.setOpeningAttachments(ticket.publicId, att);
    const messages = await ticketsService.listMessages(ticket.publicId);
    expect(messages[0]?.authorType).toBe("customer");
    expect(messages[0]?.attachments).toEqual(att);
  });

  it("changeStatus to resolved writes a system message and sets closedAt", async () => {
    const customer = await seedUser("Cust Resolve", "user");
    const staff = await seedUser("Staff Resolve", "member");

    actAs(customer, "user");
    const ticket = await ticketsService.create({ subject: "Catering quote", category: "catering", subcategory: "", body: "Need a quote." });

    actAs(staff, "member");
    await ticketsService.changeStatus(ticket.publicId, "resolved");

    const messages = await ticketsService.listMessages(ticket.publicId);
    const system = messages.find((m) => m.authorType === "system");
    expect(system).toBeDefined();
    expect(system?.body).toBe("Status: Open → Resolved");

    const [row] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
    expect(row.status).toBe("resolved");
    expect(row.closedAt).not.toBeNull();
  });

  it("customers never see who the ticket is assigned to; staff do", async () => {
    const customer = await seedUser("Cust Assign", "user");
    const staff = await seedUser("Priya Sales", "admin");

    actAs(customer, "user");
    const ticket = await ticketsService.create({ subject: "Pause", category: "order", subcategory: "order_missing", body: "Please pause." });

    actAs(staff, "admin");
    await ticketsService.assign(ticket.publicId, staff.publicId);
    await ticketsService.setPriority(ticket.publicId, "high");
    await ticketsService.changeStatus(ticket.publicId, "resolved");
    const staffView = (await ticketsService.listMessages(ticket.publicId)).map((m) => m.body);
    expect(staffView.some((b) => b.includes("Priya Sales"))).toBe(true);

    actAs(customer, "user");
    const customerView = (await ticketsService.listMessages(ticket.publicId)).map((m) => m.body);
    expect(customerView).toEqual(["Please pause.", "Status: Open → Resolved"]);
  });

  it("the first staff reply claims an unowned ticket; later replies and customer replies never move it", async () => {
    const customer = await seedUser("Cust Own", "user");
    const first = await seedUser("Staff First", "member");
    const second = await seedUser("Staff Second", "admin");
    const ownerOf = async (id: bigint) => (await db.select().from(tickets).where(eq(tickets.id, id)))[0].currentOwner;

    actAs(customer, "user");
    const ticket = await ticketsService.create({ subject: "Owner", category: "order", subcategory: "order_missing", body: "Hello?" });
    await db.update(tickets).set({ currentOwner: null }).where(eq(tickets.id, ticket.id));

    actAs(customer, "user");
    await ticketsService.reply(ticket.publicId, "Anyone?");
    expect(await ownerOf(ticket.id)).toBeNull();

    actAs(first, "member");
    await ticketsService.reply(ticket.publicId, "Looking into it");
    expect(await ownerOf(ticket.id)).toBe(first.id);

    await ticketsService.reply(ticket.publicId, "One moment");
    actAs(customer, "user");
    await ticketsService.reply(ticket.publicId, "Thanks");
    actAs(second, "admin");
    await ticketsService.reply(ticket.publicId, "Chiming in");
    expect(await ownerOf(ticket.id)).toBe(first.id);

    const notes = (await ticketsService.listMessages(ticket.publicId)).filter((m) => m.authorType === "system").map((m) => m.body);
    expect(notes).toEqual(["Assigned to Staff First"]);
  });

  it("a staff reply claims a ticket owned by a non-staff user or the system user", async () => {
    const customer = await seedUser("Cust Stale", "user");
    const other = await seedUser("Not Staff", "user");
    const staff = await seedUser("Staff Claim", "member");
    const [sys] = await db.insert(users).values({ email: `sys${Math.random().toString(36).slice(2)}@test.invalid`, name: "Sys", role: "admin", isSystem: true }).returning({ id: users.id });
    seededUserIds.push(sys.id);
    const ownerOf = async (id: bigint) => (await db.select().from(tickets).where(eq(tickets.id, id)))[0].currentOwner;

    for (const stale of [other.id, sys.id]) {
      actAs(customer, "user");
      const ticket = await ticketsService.create({ subject: "Stale", category: "order", subcategory: "order_missing", body: "Hi" });
      await db.update(tickets).set({ currentOwner: stale }).where(eq(tickets.id, ticket.id));
      actAs(staff, "member");
      await ticketsService.reply(ticket.publicId, "Mine");
      expect(await ownerOf(ticket.id)).toBe(staff.id);
    }
  });

  it("a new customer ticket is owned by a member of the Tickets pool", async () => {
    const customer = await seedUser("Cust Pool", "user");
    const pooled = await seedUser("Pooled Staff", "member");
    await db.insert(ownerPool).values({ entity: "ticket", userId: pooled.id, weight: 1 });
    await resetPoolCache();
    try {
      actAs(customer, "user");
      const ticket = await ticketsService.create({ subject: "Pool", category: "order", subcategory: "order_missing", body: "Hi" });
      expect(ticket.currentOwner).toBe(pooled.id);
    } finally {
      await db.delete(ownerPool).where(eq(ownerPool.userId, pooled.id));
      await resetPoolCache();
    }
  });

  it("the customer rates a completed chat 1-5 stars; not before, not staff", async () => {
    const customer = await seedUser("Cust Rate", "user");
    const staff = await seedUser("Staff Rate", "admin");

    actAs(customer, "user");
    const ticket = await ticketsService.create({ subject: "Late", category: "delivery", subcategory: "late_delivery", body: "Came late." });
    await expect(ticketsService.rate(ticket.publicId, 5)).rejects.toThrow(ValidationError);

    actAs(staff, "admin");
    await ticketsService.changeStatus(ticket.publicId, "resolved");
    await expect(ticketsService.rate(ticket.publicId, 5)).rejects.toThrow(ForbiddenError);

    actAs(customer, "user");
    await expect(ticketsService.rate(ticket.publicId, 6)).rejects.toThrow(ValidationError);
    await ticketsService.rate(ticket.publicId, 4, "  Quick fix  ");
    await ticketsService.rate(ticket.publicId, 5);
    const [row] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
    expect(row).toMatchObject({ rating: 5, ratingNote: null });
    expect(row.ratedAt).not.toBeNull();
  });

  it("staff can reclassify category/subcategory; customers cannot", async () => {
    const customer = await seedUser("Cust Category", "user");
    const staff = await seedUser("Staff Category", "member");

    actAs(customer, "user");
    const ticket = await ticketsService.create({
      subject: "Missing tiffin",
      category: "delivery",
      subcategory: "not_delivered",
      body: "Never showed up.",
    });

    actAs(customer, "user");
    await expect(
      ticketsService.setCategory(ticket.publicId, "food_meal", "food_quality"),
    ).rejects.toThrow(ForbiddenError);

    actAs(staff, "member");
    await expect(
      ticketsService.setCategory(ticket.publicId, "food_meal", "not_delivered"),
    ).rejects.toThrow(ValidationError);

    await ticketsService.setCategory(ticket.publicId, "food_meal", "food_quality");
    const [row] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
    expect(row).toMatchObject({ category: "food_meal", subcategory: "food_quality" });

    const notes = (await ticketsService.listMessages(ticket.publicId))
      .filter((m) => m.authorType === "system")
      .map((m) => m.body);
    expect(notes).toEqual(["Category: Delivery / Tiffin not delivered → Food & Meal / Food quality"]);

    actAs(customer, "user");
    const customerView = (await ticketsService.listMessages(ticket.publicId)).map((m) => m.body);
    expect(customerView).toEqual(["Never showed up."]);
  });

  it("a different customer cannot read or reply to another customer's ticket", async () => {
    const owner = await seedUser("Cust Owner", "user");
    const intruder = await seedUser("Cust Intruder", "user");

    actAs(owner, "user");
    const ticket = await ticketsService.create({ subject: "Private", category: "general", subcategory: "something_else", body: "Confidential." });

    actAs(intruder, "user");
    await expect(ticketsService.listMessages(ticket.publicId)).rejects.toThrow(ForbiddenError);
    await expect(ticketsService.reply(ticket.publicId, "Let me peek")).rejects.toThrow(ForbiddenError);
  });
});
