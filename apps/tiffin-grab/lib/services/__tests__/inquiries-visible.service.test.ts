import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { NotFoundError } from "@foundry/commons";
import { ensureSystemUser } from "@/db/test-helpers";
import { db } from "@/db/client";
import { inquiries, inquiryActivities, organization } from "@/db/schema";

vi.mock("@/lib/auth/session", () => ({ getSession: async () => null }));

const { assertInquiriesVisible, inquiriesService } = await import("../inquiries.service");

const made: string[] = [];
const orgs: string[] = [];
let mine: string;
let theirs: string;
let orphan: string;

async function lead(org: string | null) {
  const inq = await inquiriesService.create({
    fullName: "Visible Lead",
    phone: `+1647555${String(4000 + made.length).padStart(4, "0")}`,
    sourceKey: "manual",
    email: `vis-${Math.random().toString(36).slice(2)}@test.invalid`,
  });
  await db.update(inquiries).set({ organizationId: org }).where(eq(inquiries.publicId, inq.publicId));
  made.push(inq.publicId);
  return inq.publicId;
}

async function cleanup() {
  if (made.length) {
    const ids = db.select({ id: inquiries.id }).from(inquiries).where(inArray(inquiries.publicId, made));
    await db.delete(inquiryActivities).where(inArray(inquiryActivities.inquiryId, ids));
    await db.delete(inquiries).where(inArray(inquiries.publicId, made));
  }
  if (orgs.length) await db.delete(organization).where(inArray(organization.id, orgs));
}

describe("assertInquiriesVisible", () => {
  beforeAll(async () => {
    await ensureSystemUser();
    for (const name of ["Mine", "Theirs"]) {
      const [{ id }] = await db
        .insert(organization)
        .values({ name: `${name} Org`, clientCode: `IV-${name}-${Date.now()}` })
        .returning({ id: organization.id });
      orgs.push(id);
    }
    mine = await lead(orgs[0]);
    theirs = await lead(orgs[1]);
    orphan = await lead(null);
  });
  afterAll(cleanup);

  it("passes for leads in the viewer's organizations", async () => {
    await expect(assertInquiriesVisible([mine], [orgs[0]])).resolves.toBeUndefined();
  });

  it("rejects a lead from another franchise as not found", async () => {
    await expect(assertInquiriesVisible([theirs], [orgs[0]])).rejects.toBeInstanceOf(NotFoundError);
  });

  it("fails the whole batch when any lead is hidden", async () => {
    await expect(assertInquiriesVisible([mine, theirs], [orgs[0]])).rejects.toBeInstanceOf(NotFoundError);
  });

  it("a lead with no organization is visible only to 'all'", async () => {
    await expect(assertInquiriesVisible([orphan], [orgs[0]])).rejects.toBeInstanceOf(NotFoundError);
    await expect(assertInquiriesVisible([orphan, mine, theirs], "all")).resolves.toBeUndefined();
  });

  it("an empty visible list sees nothing; an unknown id is not found", async () => {
    await expect(assertInquiriesVisible([mine], [])).rejects.toBeInstanceOf(NotFoundError);
    await expect(assertInquiriesVisible(["inq_does_not_exist"], "all")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("duplicate ids count once", async () => {
    await expect(assertInquiriesVisible([mine, mine], [orgs[0]])).resolves.toBeUndefined();
  });
});
