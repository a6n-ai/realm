import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { featureFlags, inquiries, userFeatureFlags, users } from "@/db/schema";
import { ForbiddenError, ValidationError } from "@realm/commons";

const REASSIGN_FLAG = "reassign_records";

const session: { user: { id: string; role: string } | null } = { user: null };
vi.mock("@/lib/auth/session", () => ({ getSession: async () => (session.user ? session : null) }));

const { inquiriesService } = await import("../inquiries.service");

const seededUserIds: bigint[] = [];
const seededInquiryIds: bigint[] = [];
let flagId: bigint | null = null;
let flagCreated = false;

async function seedUser(name: string, role: "user" | "member" | "admin", isSystem = false) {
  const [u] = await db
    .insert(users)
    .values({ name, role, isSystem })
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
    });
    inquiryPublicId = inq.publicId;
    seededInquiryIds.push(inq.id);

    // The flag is seeded (default-off) in dev/prod; reuse it if present so the
    // test is idempotent, else create it. Only a test-created row is deleted.
    const [existing] = await db
      .select({ id: featureFlags.id })
      .from(featureFlags)
      .where(eq(featureFlags.key, REASSIGN_FLAG))
      .limit(1);
    if (existing) {
      flagId = existing.id;
    } else {
      const [flag] = await db
        .insert(featureFlags)
        .values({ key: REASSIGN_FLAG, label: "Reassign records", defaultEnabled: false })
        .returning({ id: featureFlags.id });
      flagId = flag.id;
      flagCreated = true;
    }
  });

  afterAll(async () => {
    if (flagId) {
      await db.delete(userFeatureFlags).where(eq(userFeatureFlags.flagId, flagId));
      if (flagCreated) await db.delete(featureFlags).where(eq(featureFlags.id, flagId));
    }
    if (seededInquiryIds.length) await db.delete(inquiries).where(inArray(inquiries.id, seededInquiryIds));
    if (seededUserIds.length) await db.delete(users).where(inArray(users.id, seededUserIds));
    session.user = null;
  });

  it("rejects when the caller lacks the reassign_records flag", async () => {
    actAs(caller, "admin");
    await expect(inquiriesService.reassign(inquiryPublicId, goodOwner.publicId)).rejects.toThrow(ForbiddenError);
  });

  it("rejects an ineligible owner (customer role) even with the flag enabled", async () => {
    await db.insert(userFeatureFlags).values({ userId: caller.id, flagId: flagId!, enabled: true });
    actAs(caller, "admin");
    await expect(inquiriesService.reassign(inquiryPublicId, badOwnerUser.publicId)).rejects.toThrow(ValidationError);
  });

  it("reassigns to a valid staff owner when the flag is enabled", async () => {
    actAs(caller, "admin");
    await inquiriesService.reassign(inquiryPublicId, goodOwner.publicId);
    const [row] = await db.select().from(inquiries).where(eq(inquiries.publicId, inquiryPublicId));
    expect(row.currentOwner).toBe(goodOwner.id);
  });
});
