import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { inquiries, notificationOutbox, users } from "@/db/schema";
import { ForbiddenError, ValidationError } from "@foundry/commons";

const session: { user: { id: string; role: string } | null } = { user: null };
vi.mock("@/lib/auth/session", () => ({ getSession: async () => (session.user ? session : null) }));

const { inquiriesService } = await import("../../inquiries/inquiries.service");

const seededUserIds: bigint[] = [];
const seededInquiryIds: bigint[] = [];

async function seedUser(name: string, role: "user" | "member" | "admin", isSystem = false) {
  const [u] = await db
    .insert(users)
    .values({ email: `u${Math.random().toString(36).slice(2)}@test.invalid`,  name, role, isSystem })
    .returning({ id: users.id, publicId: users.publicId });
  seededUserIds.push(u.id);
  return u;
}

function actAs(user: { publicId: string }, role: "user" | "member" | "admin") {
  session.user = { id: user.publicId, role };
}

describe("inquiriesService.reassign", () => {
  let caller: { id: bigint; publicId: string };
  let goodOwner: { id: bigint; publicId: string };
  let badOwnerUser: { id: bigint; publicId: string };
  let inquiryPublicId: string;

  beforeAll(async () => {
    caller = await seedUser("Reassign Caller", "admin");
    goodOwner = await seedUser("Good Owner", "member");
    badOwnerUser = await seedUser("Bad Owner (customer)", "user");

    actAs(caller, "admin");
    const inq = await inquiriesService.create({
      fullName: "Reassign Lead",
      phone: "+16475559000",
      sourceKey: "facebook",
      email: `inq-${Math.random().toString(36).slice(2)}@test.invalid`,
    });
    inquiryPublicId = inq.publicId;
    seededInquiryIds.push(inq.id);
  });

  afterAll(async () => {
    if (seededInquiryIds.length) await db.delete(inquiries).where(inArray(inquiries.id, seededInquiryIds));
    if (seededUserIds.length) await db.delete(notificationOutbox).where(inArray(notificationOutbox.recipientId, seededUserIds));
    if (seededUserIds.length) await db.delete(users).where(inArray(users.id, seededUserIds));
    session.user = null;
  });

  it("rejects a non-admin caller", async () => {
    actAs(caller, "member");
    await expect(inquiriesService.reassign(inquiryPublicId, goodOwner.publicId)).rejects.toThrow(ForbiddenError);
  });

  it("lets an admin reassign", async () => {
    const admin = await seedUser("Second Admin", "admin");
    actAs(admin, "admin");
    await inquiriesService.reassign(inquiryPublicId, goodOwner.publicId);
    const [row] = await db.select().from(inquiries).where(eq(inquiries.publicId, inquiryPublicId));
    expect(row.currentOwner).toBe(goodOwner.id);
  });

  it("rejects an ineligible owner (customer role)", async () => {
    actAs(caller, "admin");
    await expect(inquiriesService.reassign(inquiryPublicId, badOwnerUser.publicId)).rejects.toThrow(ValidationError);
  });

  it("reassigns to a valid staff owner", async () => {
    actAs(caller, "admin");
    await inquiriesService.reassign(inquiryPublicId, goodOwner.publicId);
    const [row] = await db.select().from(inquiries).where(eq(inquiries.publicId, inquiryPublicId));
    expect(row.currentOwner).toBe(goodOwner.id);
  });

  it("reassignMany moves every selected inquiry to the new owner", async () => {
    actAs(caller, "admin");
    const second = await inquiriesService.create({ fullName: "Reassign Lead 2", phone: "+16475559001", sourceKey: "facebook" });
    seededInquiryIds.push(second.id);
    const n = await inquiriesService.reassignMany([inquiryPublicId, second.publicId, second.publicId], caller.publicId);
    expect(n).toBe(2);
    const rows = await db.select().from(inquiries).where(inArray(inquiries.publicId, [inquiryPublicId, second.publicId]));
    expect(rows.map((r) => r.currentOwner)).toEqual([caller.id, caller.id]);
  });

  it("reassignMany rejects a customer as owner", async () => {
    actAs(caller, "admin");
    await expect(inquiriesService.reassignMany([inquiryPublicId], badOwnerUser.publicId)).rejects.toThrow(ValidationError);
  });
});
