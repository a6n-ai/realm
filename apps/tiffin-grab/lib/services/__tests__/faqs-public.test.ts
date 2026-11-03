import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";

const { db } = await import("@/db/client");
const { organization, publicFaqs } = await import("@/db/schema");
const { listPublicFaqs } = await import("../faqs.service");
const { evictPublicPages } = await import("@/lib/landing/public-cache");

const PFX = "zz-faq-";
let orgWithFaqs: string;
let orgWithout: string;

async function makeOrg(slug: string, code: string): Promise<string> {
  await db.insert(organization).values({ name: slug, slug, clientCode: code }).onConflictDoNothing();
  return (await db.select({ id: organization.id }).from(organization).where(eq(organization.slug, slug)).limit(1))[0]!.id;
}

describe("listPublicFaqs", () => {
  beforeAll(async () => {
    orgWithFaqs = await makeOrg(`${PFX}own`, "ZZFAQ1");
    orgWithout = await makeOrg(`${PFX}none`, "ZZFAQ2");
    await db.delete(publicFaqs).where(like(publicFaqs.question, `${PFX}%`));
    await db.insert(publicFaqs).values([
      { question: `${PFX}org`, answer: "a", organizationId: orgWithFaqs },
      { question: `${PFX}brand`, answer: "a", organizationId: null },
    ]);
    await evictPublicPages();
  });
  afterAll(async () => {
    await db.delete(publicFaqs).where(like(publicFaqs.question, `${PFX}%`));
    await evictPublicPages();
  });

  it("returns the org's FAQs for an org id and brand FAQs for null", async () => {
    const own = (await listPublicFaqs(orgWithFaqs)).map((f) => f.question);
    expect(own).toEqual([`${PFX}org`]);
    const fallback = (await listPublicFaqs(orgWithout)).map((f) => f.question);
    expect(fallback).toContain(`${PFX}brand`);
    expect(fallback).not.toContain(`${PFX}org`);
    const brand = (await listPublicFaqs(null)).map((f) => f.question);
    expect(brand).toContain(`${PFX}brand`);
    expect(brand).not.toContain(`${PFX}org`);
  });
});
