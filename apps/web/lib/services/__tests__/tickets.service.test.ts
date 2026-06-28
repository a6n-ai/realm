import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { ticketMessages, tickets, users } from "@/db/schema";
import { ForbiddenError } from "@tiffin/commons";

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

  it("a customer reply on a resolved ticket reopens it and clears closedAt", async () => {
    const customer = await seedUser("Cust Reopen", "user");
    const staff = await seedUser("Staff Reopen", "admin");

    actAs(customer, "user");
    const ticket = await ticketsService.create({ subject: "Billing issue", category: "billing", body: "Charged twice." });

    actAs(staff, "admin");
    await ticketsService.changeStatus(ticket.publicId, "resolved");

    const [resolved] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
    expect(resolved.status).toBe("resolved");
    expect(resolved.closedAt).not.toBeNull();

    actAs(customer, "user");
    await ticketsService.reply(ticket.publicId, "Still wrong, please fix.");

    const [reopened] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
    expect(reopened.status).toBe("open");
    expect(reopened.closedAt).toBeNull();
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
