import { eq } from "drizzle-orm";
import { db } from "./client";
import { leadSources, leadSubsources } from "./schema";

const SOURCES = [
  { key: "manual", label: "Manual", isInbound: false },
  { key: "referral", label: "Referral", isInbound: true },
  { key: "website", label: "Website", isInbound: true },
  { key: "google", label: "Google", isInbound: true },
  { key: "facebook", label: "Facebook", isInbound: true },
  { key: "instagram", label: "Instagram", isInbound: true },
];

const SUBSOURCES: Record<string, { key: string; label: string }[]> = {
  facebook: [
    { key: "facebook_feed", label: "Facebook Feed" },
    { key: "facebook_ads", label: "Facebook Ads" },
  ],
  instagram: [{ key: "instagram_reels", label: "Instagram Reels" }],
};

export async function seedLeadSources() {
  for (const s of SOURCES) {
    const [existing] = await db.select({ id: leadSources.id }).from(leadSources).where(eq(leadSources.key, s.key)).limit(1);
    const sourceId = existing?.id
      ?? (await db.insert(leadSources).values(s).returning({ id: leadSources.id }))[0].id;
    for (const sub of SUBSOURCES[s.key] ?? []) {
      const [subExists] = await db.select({ id: leadSubsources.id }).from(leadSubsources).where(eq(leadSubsources.key, sub.key)).limit(1);
      if (!subExists) await db.insert(leadSubsources).values({ ...sub, sourceId });
    }
  }
  console.log("Seeded lead sources + sub-sources");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedLeadSources().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
