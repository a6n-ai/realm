import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { appSettings, inquiries, inquiryActivities, users } from "@/db/schema";
import type { LeadAssignmentConfig } from "../assignment";

const session: { user: { id: string; role: string } | null } = { user: null };
vi.mock("@/lib/auth/session", () => ({ getSession: async () => (session.user ? session : null) }));

const { inquiriesService } = await import("../inquiries.service");
const { setLeadAssignment } = await import("../app-settings.service");

const seededUserIds: bigint[] = [];

async function seedMember(name: string, flags: { acceptsLeads?: boolean; inDefaultPool?: boolean }) {
  const [u] = await db
    .insert(users)
    .values({ name, acceptsLeads: flags.acceptsLeads ?? false, inDefaultPool: flags.inDefaultPool ?? false, role: "member" })
    .returning({ id: users.id, publicId: users.publicId });
  seededUserIds.push(u.id);
  return u;
}

async function ensureSystemUser() {
  const [sys] = await db.select({ id: users.id }).from(users).where(eq(users.isSystem, true)).limit(1);
  if (sys) return sys;
  // The system user is a permanent fixture (seeded by db:seed:admin). Create it
  // if a bare test DB lacks it, but NEVER register it for afterAll deletion —
  // other live-DB suites route inbound inquiries through systemUserId().
  const [created] = await db
    .insert(users)
    .values({ name: "System", email: "system@tiffingrab.internal", role: "admin", isSystem: true })
    .returning({ id: users.id });
  return created;
}

async function clearPoolFlags() {
  // No pre-existing seeded user should carry pool flags into these assertions.
  await db.update(users).set({ acceptsLeads: false, inDefaultPool: false });
}

const RR: LeadAssignmentConfig = { strategy: "round_robin", perSource: {}, weights: {}, cursor: {} };

describe("inquiriesService inbound owner resolution via assignment engine", () => {
  beforeEach(async () => {
    await db.delete(inquiryActivities);
    await db.delete(inquiries);
    session.user = null;
    await clearPoolFlags();
  });

  afterAll(async () => {
    await db.delete(inquiryActivities);
    await db.delete(inquiries);
    if (seededUserIds.length) await db.delete(users).where(inArray(users.id, seededUserIds));
    await db.delete(appSettings);
  });

  it("round_robin assigns two consecutive inbound creates to two different acceptsLeads members", async () => {
    const m1 = await seedMember("RR One", { acceptsLeads: true });
    const m2 = await seedMember("RR Two", { acceptsLeads: true });
    await ensureSystemUser();
    await setLeadAssignment(RR);

    const a = await inquiriesService.create({ fullName: "Lead A", phone: "+16475553001", sourceKey: "website" });
    const b = await inquiriesService.create({ fullName: "Lead B", phone: "+16475553002", sourceKey: "website" });

    const [rowA] = await db.select().from(inquiries).where(eq(inquiries.id, a.id));
    const [rowB] = await db.select().from(inquiries).where(eq(inquiries.id, b.id));

    const owners = [rowA.currentOwner, rowB.currentOwner];
    expect(new Set(owners).size).toBe(2);
    expect(owners).toEqual(expect.arrayContaining([m1.id, m2.id]));
  });

  it("falls back to an inDefaultPool member when no acceptsLeads members exist", async () => {
    const pool = await seedMember("Pool Member", { inDefaultPool: true });
    await ensureSystemUser();
    await setLeadAssignment(RR);

    const inq = await inquiriesService.create({ fullName: "Lead C", phone: "+16475553003", sourceKey: "website" });
    const [row] = await db.select().from(inquiries).where(eq(inquiries.id, inq.id));
    expect(row.currentOwner).toBe(pool.id);
  });

  it("falls back to the system user when neither pool has members (never null)", async () => {
    const sys = await ensureSystemUser();
    await setLeadAssignment(RR);

    const inq = await inquiriesService.create({ fullName: "Lead D", phone: "+16475553004", sourceKey: "website" });
    const [row] = await db.select().from(inquiries).where(eq(inquiries.id, inq.id));
    expect(row.currentOwner).toBe(sys.id);
    expect(row.currentOwner).not.toBeNull();
  });
});
