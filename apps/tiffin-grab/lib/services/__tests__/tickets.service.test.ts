import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { ticketMessages, tickets, users } from "@/db/schema";
import { ForbiddenError, ValidationError } from "@realm/commons";

const session: { user: { id: string; role: string } | null } = { user: null };
vi.mock("@/lib/auth/session", () => ({ getSession: async () => (session.user ? session : null) }));

const { ticketsService } = await import("../tickets.service");

const seededUserIds: bigint[] = [];

async function seedUser(name: string, role: "user" | "member" | "admin") {
  const [u] = await db.insert(users).values({ name, role }).returning({ id: users.id, publicId: users.publicId });
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
}

describe("ticketsService", () => {
  beforeEach(reset);

  afterAll(async () => {
    await db.delete(ticketMessages);
    await db.delete(tickets);
    if (seededUserIds.length) await db.delete(users).where(inArray(users.id, seededUserIds));
  });

  it("create inserts an open ticket and a first customer message", async () => {
    const customer = await seedUser("Cust Create", "user");
    actAs(customer, "user");

    const ticket = await ticketsService.create({ subject: "Where is my order?", category: "order", body: "It never arrived." });
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
    const ticket = await ticketsService.create({ subject: "Billing", category: "billing", body: "Charged twice." });

    actAs(staff, "admin");
    await ticketsService.changeStatus(ticket.publicId, "resolved");

    actAs(customer, "user");
    await expect(ticketsService.reply(ticket.publicId, "Still wrong")).rejects.toThrow(ForbiddenError);

    const [row] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
    expect(row.status).toBe("resolved");
  });

  it("rejects a staff reply on a closed ticket", async () => {
    const customer = await seedUser("Cust Closed", "user");
    const staff = await seedUser("Staff Closed", "member");

    actAs(customer, "user");
    const ticket = await ticketsService.create({ subject: "Closed", category: "general", body: "Done?" });

    actAs(staff, "member");
    await ticketsService.changeStatus(ticket.publicId, "closed");
    await expect(ticketsService.reply(ticket.publicId, "One more thing")).rejects.toThrow(ForbiddenError);
  });

  it("staff reopen (changeStatus to open) clears closedAt and lets replies resume", async () => {
    const customer = await seedUser("Cust Resume", "user");
    const staff = await seedUser("Staff Resume", "admin");

    actAs(customer, "user");
    const ticket = await ticketsService.create({ subject: "Resume", category: "order", body: "Where?" });

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
    const ticket = await ticketsService.create({ subject: "Photo", category: "order", body: "See photo." });
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
      category: "order",
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
    const ticket = await ticketsService.create({ subject: "Catering quote", category: "catering", body: "Need a quote." });

    actAs(staff, "member");
    await ticketsService.changeStatus(ticket.publicId, "resolved");

    const messages = await ticketsService.listMessages(ticket.publicId);
    const system = messages.find((m) => m.authorType === "system");
    expect(system).toBeDefined();
    expect(system?.body).toBe("Status: open → resolved");

    const [row] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
    expect(row.status).toBe("resolved");
    expect(row.closedAt).not.toBeNull();
  });

  it("a different customer cannot read or reply to another customer's ticket", async () => {
    const owner = await seedUser("Cust Owner", "user");
    const intruder = await seedUser("Cust Intruder", "user");

    actAs(owner, "user");
    const ticket = await ticketsService.create({ subject: "Private", category: "general", body: "Confidential." });

    actAs(intruder, "user");
    await expect(ticketsService.listMessages(ticket.publicId)).rejects.toThrow(ForbiddenError);
    await expect(ticketsService.reply(ticket.publicId, "Let me peek")).rejects.toThrow(ForbiddenError);
  });
});
