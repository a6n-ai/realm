import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { sectionSeen, tickets, ticketMessages, users } from "@/db/schema";

const session: { user: { id: string; role: string } | null } = { user: null };
vi.mock("@/lib/auth/session", () => ({ getSession: async () => (session.user ? session : null) }));

const { newActivity, markRead, markAllRead } = await import("../section-seen.service");

const seededUserIds: bigint[] = [];
async function seedUser(name: string, role: "user" | "member" | "admin") {
  const [u] = await db.insert(users).values({ name, role }).returning({ id: users.id, publicId: users.publicId });
  seededUserIds.push(u.id);
  return u;
}
function actAs(u: { publicId: string }, role: "user" | "member" | "admin") {
  session.user = { id: u.publicId, role };
}

async function reset() {
  await db.delete(ticketMessages);
  await db.delete(tickets);
  if (seededUserIds.length) await db.delete(sectionSeen).where(inArray(sectionSeen.userId, seededUserIds));
  session.user = null;
}

describe("section-seen", () => {
  beforeEach(reset);
  afterAll(async () => {
    await db.delete(ticketMessages);
    await db.delete(tickets);
    if (seededUserIds.length) {
      await db.delete(sectionSeen).where(inArray(sectionSeen.userId, seededUserIds));
      await db.delete(users).where(inArray(users.id, seededUserIds));
    }
  });

  it("flags customers as new when a fresh user exists after markAllRead-then-signup", async () => {
    const staff = await seedUser("Staff Seen", "admin");
    actAs(staff, "admin");
    await markAllRead(); // seen_at = now for all sections

    // A brand-new customer created after the marker → customers section is new.
    await seedUser("New Customer", "user");
    const a = await newActivity();
    expect(a.customers).toBe(true);
  });

  it("markRead(tickets) clears the tickets flag for a pre-existing ticket", async () => {
    const staff = await seedUser("Staff Clear", "admin");
    const customer = await seedUser("Cust Clear", "user");

    actAs(customer, "user");
    // create a ticket via direct insert to avoid coupling to ticketsService here
    await db.insert(tickets).values({ raisedBy: customer.id, subject: "x", category: "general" });

    actAs(staff, "admin");
    expect((await newActivity()).tickets).toBe(true);
    await markRead("tickets");
    expect((await newActivity()).tickets).toBe(false);
  });
});
