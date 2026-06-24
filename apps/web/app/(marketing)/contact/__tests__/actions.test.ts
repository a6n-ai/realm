import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ValidationError } from "@tiffin/commons";
import { db } from "@/db/client";
import { inquiries, inquiryActivities, leadSources } from "@/db/schema";

// Contact action transitively imports the session service (NextAuth) — stub it.
vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { createWebsiteInquiry } = await import("../actions");

async function reset() {
  await db.delete(inquiryActivities);
  await db.delete(inquiries);
}

describe("createWebsiteInquiry", () => {
  beforeEach(reset);
  afterAll(reset);

  it("creates a website inquiry with a created activity", async () => {
    const res = await createWebsiteInquiry({ fullName: "Web Lead", phone: "+16475559000", message: "Interested" });
    expect(res.ok).toBe(true);
    const [row] = await db.select().from(inquiries).where(eq(inquiries.phone, "+16475559000"));
    const [src] = await db.select({ key: leadSources.key }).from(leadSources).where(eq(leadSources.id, row.sourceId)).limit(1);
    expect(src.key).toBe("website");
    expect(row.notes).toBe("Interested");
    const acts = await db.select().from(inquiryActivities).where(eq(inquiryActivities.inquiryId, row.id));
    expect(acts.some((a) => a.type === "created")).toBe(true);
  });

  it("flags an unserved postal code as waitlisted", async () => {
    const res = await createWebsiteInquiry({ fullName: "Far Lead", phone: "+16475559001", postalCode: "X0X 0X0" });
    expect(res.waitlisted).toBe(true);
  });

  it("rejects a malformed phone", async () => {
    await expect(createWebsiteInquiry({ fullName: "Bad", phone: "12" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("accepts a national number and stores it as E.164", async () => {
    const res = await createWebsiteInquiry({ fullName: "National Lead", phone: "647 555 0003" });
    expect(res.ok).toBe(true);
    const [row] = await db.select().from(inquiries).where(eq(inquiries.phone, "+16475550003"));
    expect(row).toBeDefined();
    expect(row.phone).toBe("+16475550003");
  });

  it("silently drops a honeypot-filled submission without writing", async () => {
    const res = await createWebsiteInquiry({ fullName: "Bot", phone: "+16475559002", company: "spam-co" });
    expect(res.ok).toBe(true);
    const rows = await db.select().from(inquiries).where(eq(inquiries.phone, "+16475559002"));
    expect(rows).toHaveLength(0);
  });
});
