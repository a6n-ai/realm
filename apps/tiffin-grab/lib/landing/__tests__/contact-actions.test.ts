import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ValidationError } from "@foundry/commons";
import { db } from "@/db/client";
import { inquiries, inquiryActivities, leadSources, users } from "@/db/schema";

// Contact action transitively imports the session service (NextAuth) — stub it.
vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const tracked = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/lib/services/tracking", () => ({ trackConversion: () => { tracked.calls++; } }));

const { createWebsiteInquiry } = await import("../contact-actions");

function testEmail() {
  return `inq-${Math.random().toString(36).slice(2)}@test.invalid`;
}

async function reset() {
  await db.delete(inquiryActivities);
  await db.delete(inquiries);
  const [sys] = await db.select({ id: users.id }).from(users).where(eq(users.isSystem, true)).limit(1);
  if (!sys) {
    await db.insert(users).values({ name: "System", email: "system@tiffingrab.internal", role: "admin", isSystem: true });
  }
}

describe("createWebsiteInquiry", () => {
  beforeEach(reset);
  afterAll(reset);

  it("creates a website inquiry with a created activity", async () => {
    const res = await createWebsiteInquiry({ fullName: "Web Lead", phone: "+16475559000", message: "Interested", email: testEmail() });
    expect(res.ok).toBe(true);
    const [row] = await db.select().from(inquiries).where(eq(inquiries.phone, "+16475559000"));
    const [src] = await db.select({ key: leadSources.key }).from(leadSources).where(eq(leadSources.id, row.sourceId)).limit(1);
    expect(src.key).toBe("website");
    expect(row.notes).toBe("Interested");
    const acts = await db.select().from(inquiryActivities).where(eq(inquiryActivities.inquiryId, row.id));
    expect(acts.some((a) => a.type === "created")).toBe(true);
  });

  it("stores the postal code on the inquiry", async () => {
    await createWebsiteInquiry({ fullName: "Postal Lead", phone: "+16475559010", postalCode: "M5V 2T6", email: testEmail() });
    const [row] = await db.select().from(inquiries).where(eq(inquiries.phone, "+16475559010"));
    expect(row.postalCode).toBe("M5V 2T6");
  });

  it("a repeat contact does not send a second Lead event", async () => {
    const email = testEmail();
    tracked.calls = 0;
    await createWebsiteInquiry({ fullName: "Twice", phone: "+16475559011", email });
    await createWebsiteInquiry({ fullName: "Twice", phone: "+16475559011", email });
    expect(tracked.calls).toBe(1);
  });

  it("a waitlist inquiry records details.source waitlist", async () => {
    await createWebsiteInquiry({ fullName: "Wait", phone: "+16475559012", postalCode: "X0X 0X0", email: testEmail() }, { detailsSource: "waitlist" });
    const [row] = await db.select().from(inquiries).where(eq(inquiries.phone, "+16475559012"));
    const [created] = await db.select().from(inquiryActivities).where(eq(inquiryActivities.inquiryId, row.id));
    expect(created.details).toMatchObject({ source: "waitlist" });
  });

  it("flags an unserved postal code as waitlisted", async () => {
    const res = await createWebsiteInquiry({ fullName: "Far Lead", phone: "+16475559001", postalCode: "X0X 0X0", email: testEmail() });
    expect(res.waitlisted).toBe(true);
  });

  it("rejects a malformed phone", async () => {
    await expect(createWebsiteInquiry({ fullName: "Bad", phone: "12", email: testEmail() })).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a submission with no email and writes nothing", async () => {
    // The inquiry this creates needs an email — it is the customer's login path.
    // Before the contact form required one, an emailless submission reached
    // InquiriesService.create, threw there, and the lead was silently lost.
    await expect(
      createWebsiteInquiry({ fullName: "No Email", phone: "+16475559004", email: "" }),
    ).rejects.toBeInstanceOf(ValidationError);
    const rows = await db.select().from(inquiries).where(eq(inquiries.phone, "+16475559004"));
    expect(rows).toHaveLength(0);
  });

  it("accepts a national number and stores it as E.164", async () => {
    const res = await createWebsiteInquiry({ fullName: "National Lead", phone: "647 555 0003", email: testEmail() });
    expect(res.ok).toBe(true);
    const [row] = await db.select().from(inquiries).where(eq(inquiries.phone, "+16475550003"));
    expect(row).toBeDefined();
    expect(row.phone).toBe("+16475550003");
  });

  it("silently drops a honeypot-filled submission without writing", async () => {
    const res = await createWebsiteInquiry({ fullName: "Bot", phone: "+16475559002", company: "spam-co", email: testEmail() });
    expect(res.ok).toBe(true);
    const rows = await db.select().from(inquiries).where(eq(inquiries.phone, "+16475559002"));
    expect(rows).toHaveLength(0);
  });
});
