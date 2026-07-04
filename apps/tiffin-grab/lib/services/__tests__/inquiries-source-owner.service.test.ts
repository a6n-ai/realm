import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { inquiries, inquiryActivities, users } from "@/db/schema";
import { ValidationError } from "@realm/commons";

const session: { user: { id: string; role: string } | null } = { user: null };
vi.mock("@/lib/auth/session", () => ({ getSession: async () => (session.user ? session : null) }));

const { inquiriesService } = await import("../inquiries.service");

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
      inquiriesService.create({ fullName: "Lead U", phone: "+16475552000", sourceKey: "nope" }),
    ).rejects.toThrow(ValidationError);
  });

  it("manual (non-inbound) source assigns currentOwner to the acting user", async () => {
    const [staff] = await db
      .insert(users)
      .values({ name: "Agent Owner", role: "member" })
      .returning({ id: users.id, publicId: users.publicId });
    session.user = { id: staff.publicId, role: "member" };
    const inq = await inquiriesService.create({ fullName: "Lead M", phone: "+16475552001", sourceKey: "manual" });
    const [row] = await db.select().from(inquiries).where(eq(inquiries.id, inq.id));
    expect(row.currentOwner).toBe(staff.id);
  });

  it("inbound source with no actor falls back to the system user", async () => {
    let [sys] = await db.select({ id: users.id }).from(users).where(eq(users.isSystem, true)).limit(1);
    if (!sys) {
      [sys] = await db
        .insert(users)
        .values({ name: "System", email: "system@tiffingrab.internal", role: "admin", isSystem: true })
        .returning({ id: users.id });
    }
    const inq = await inquiriesService.create({ fullName: "Lead W", phone: "+16475552002", sourceKey: "website" });
    const [row] = await db.select().from(inquiries).where(eq(inquiries.id, inq.id));
    expect(row.currentOwner).toBe(sys.id);
  });
});
