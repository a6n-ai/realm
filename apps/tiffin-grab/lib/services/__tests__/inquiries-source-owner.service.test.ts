import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { inquiries, inquiryActivities, users } from "@/db/schema";
import { ValidationError } from "@foundry/commons";

const session: { user: { id: string; role: string } | null } = { user: null };
vi.mock("@/lib/auth/session", () => ({ getSession: async () => (session.user ? session : null) }));

const { inquiriesService } = await import("../inquiries.service");
const { getBrandOrgId } = await import("../organizations.service");

function testEmail() {
  return `inq-${Math.random().toString(36).slice(2)}@test.invalid`;
}

async function reset() {
  await db.delete(inquiryActivities);
  await db.delete(inquiries);
  session.user = null;
}

describe("inquiriesService source + owner resolution", () => {
  beforeEach(reset);
  afterAll(reset);

  it("throws ValidationError on an unknown source key", async () => {
    await expect(
      inquiriesService.create({ fullName: "Lead U", phone: "+16475552000", sourceKey: "nope", email: testEmail() }),
    ).rejects.toThrow(ValidationError);
  });

  it("manual (non-inbound) source assigns currentOwner to the acting user", async () => {
    const [staff] = await db
      .insert(users)
      .values({ email: `u${Math.random().toString(36).slice(2)}@test.invalid`,  name: "Agent Owner", role: "member" })
      .returning({ id: users.id, publicId: users.publicId });
    session.user = { id: staff.publicId, role: "member" };
    const inq = await inquiriesService.create({ fullName: "Lead M", phone: "+16475552001", sourceKey: "manual", email: testEmail() });
    const [row] = await db.select().from(inquiries).where(eq(inquiries.id, inq.id));
    expect(row.currentOwner).toBe(staff.id);
  });

  it("inbound source with no actor gets a staff owner, never the system user", async () => {
    const inq = await inquiriesService.create({ fullName: "Lead W", phone: "+16475552002", sourceKey: "website", email: testEmail() });
    const [owner] = await db
      .select({ role: users.role, isSystem: users.isSystem })
      .from(inquiries)
      .innerJoin(users, eq(users.id, inquiries.currentOwner))
      .where(eq(inquiries.id, inq.id));
    expect(["admin", "member"]).toContain(owner.role);
    expect(owner.isSystem).toBe(false);
  });

  it("stamps the brand org so the lead counts in org-scoped analytics", async () => {
    const brand = await getBrandOrgId(db);
    expect(brand).not.toBeNull();
    const inq = await inquiriesService.create({ fullName: "Lead O", phone: "+16475552003", sourceKey: "website", email: testEmail() });
    const [row] = await db.select().from(inquiries).where(eq(inquiries.id, inq.id));
    expect(row.organizationId).toBe(brand);
  });
});
