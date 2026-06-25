import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { appSettings, inquiries, inquiryActivities, inquiryUserConfig, leadSources, users } from "@/db/schema";
import type { LeadAssignmentConfig } from "../assignment";

const session: { user: { id: string; role: string } | null } = { user: null };
vi.mock("@/lib/auth/session", () => ({ getSession: async () => (session.user ? session : null) }));

const { inquiriesService } = await import("../inquiries.service");
const { setLeadAssignment } = await import("../app-settings.service");

const seededUserIds: bigint[] = [];

async function seedMember(name: string) {
  const [u] = await db.insert(users).values({ name, role: "member" }).returning({ id: users.id, publicId: users.publicId });
  seededUserIds.push(u.id);
  return u;
}

async function enroll(userId: bigint, sourceId: bigint | null, weight = 1) {
  await db.insert(inquiryUserConfig).values({ userId, sourceId, weight });
}

async function sourceIdFor(key: string): Promise<bigint> {
  const [s] = await db.select({ id: leadSources.id }).from(leadSources).where(eq(leadSources.key, key)).limit(1);
  if (!s) throw new Error(`lead source not seeded: ${key}`);
  return s.id;
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

const RR: LeadAssignmentConfig = { strategy: "round_robin", perSource: {}, cursor: {} };

describe("inquiriesService inbound owner resolution via assignment engine", () => {
  beforeEach(async () => {
    await db.delete(inquiryActivities);
    await db.delete(inquiries);
    // Only clear the config rows we own; never touch other tables' fixtures.
    if (seededUserIds.length) await db.delete(inquiryUserConfig).where(inArray(inquiryUserConfig.userId, seededUserIds));
    session.user = null;
  });

  afterAll(async () => {
    await db.delete(inquiryActivities);
    await db.delete(inquiries);
    if (seededUserIds.length) {
      await db.delete(inquiryUserConfig).where(inArray(inquiryUserConfig.userId, seededUserIds));
      await db.delete(users).where(inArray(users.id, seededUserIds));
    }
    await db.delete(appSettings);
  });

  it("round_robin assigns two consecutive inbound creates to two different source-pool members", async () => {
    const m1 = await seedMember("RR One");
    const m2 = await seedMember("RR Two");
    await ensureSystemUser();
    const websiteId = await sourceIdFor("website");
    await enroll(m1.id, websiteId);
    await enroll(m2.id, websiteId);
    await setLeadAssignment(RR);

    const a = await inquiriesService.create({ fullName: "Lead A", phone: "+16475553001", sourceKey: "website" });
    const b = await inquiriesService.create({ fullName: "Lead B", phone: "+16475553002", sourceKey: "website" });

    const [rowA] = await db.select().from(inquiries).where(eq(inquiries.id, a.id));
    const [rowB] = await db.select().from(inquiries).where(eq(inquiries.id, b.id));

    const owners = [rowA.currentOwner, rowB.currentOwner];
    expect(new Set(owners).size).toBe(2);
    expect(owners).toEqual(expect.arrayContaining([m1.id, m2.id]));
  });

  it("falls back to a default-pool member when the source pool is empty", async () => {
    const pool = await seedMember("Pool Member");
    await ensureSystemUser();
    await enroll(pool.id, null);
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
