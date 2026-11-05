import type { Metadata } from "next";
import Link from "next/link";
import { BuildTiffinLink } from "@/components/landing/build-tiffin-link";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { listableMealSizes } from "@/lib/catalog/types";
import { siteOrgId } from "@/lib/tenant/site-org";
import { PageIntro } from "@/components/landing/public-shell";
import { MealCard } from "@/components/marketing/meal-card";
import { MetaViewContent } from "@/components/meta/meta-view-content";
import { pageMeta } from "@/lib/landing/meta";

export const metadata: Metadata = pageMeta("Meal sizes | Tiffin Grab", "Every tiffin meal size by tier, with calories, protein, carbs, fat and the per-tiffin rate.", "/menu");
export const revalidate = 300;
export const dynamic = "error";


const TIERS = [
  { key: "budget", label: "Budget" },
  { key: "medium", label: "Medium" },
  { key: "premium", label: "Premium" },
] as const;

export default async function MenuPage({ params }: { params: Promise<{ org: string }> }) {
  const orgId = await siteOrgId((await params).org);
  const { mealSizes } = await loadCatalogSnapshot(orgId);
  const listed = listableMealSizes(mealSizes);
  return (
    <div className="tg-wrap tg-section flex flex-col gap-12">
      <MetaViewContent contentIds={listed.map((m) => m.key)} contentName="Meal sizes" />
      <PageIntro
        eyebrow="Meal sizes"
        title={<>As much as you <span className="c-accent">need.</span></>}
        lede="Every size with its calories, macros and per-tiffin rate. The dishes change weekly; see this week's menu for them."
      />
      {TIERS.map((tier) => {
        const meals = listed.filter((m) => m.tier === tier.key);
        if (meals.length === 0) return null;
        return (
          <section key={tier.key} className="flex flex-col gap-4" aria-label={tier.label}>
            <h2 className="c-eyebrow !mb-0">{tier.label}</h2>
            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {meals.map((m) => <MealCard key={m.id} meal={m} className="tg-card p-6" />)}
            </div>
          </section>
        );
      })}
      <div className="flex flex-wrap items-center gap-3">
        <BuildTiffinLink className="tg-cta">Build my tiffin</BuildTiffinLink>
        <Link href="/menu/weekly" className="tg-btn">This week&apos;s menu</Link>
      </div>
    </div>
  );
}
