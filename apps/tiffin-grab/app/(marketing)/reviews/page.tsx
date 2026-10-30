import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getGoogleReviewsConfig, getReviewsSummary, writeReviewUrl } from "@foundry/google-reviews";
import { PageIntro } from "@/components/landing/public-shell";
import { Suspense } from "react";
import { ReviewCard, ReviewPhotos, ReviewStars } from "@/components/landing/landing-reviews";
import { integrationsConfigReadStore } from "@/lib/services/app-settings.service";
import { pageMeta } from "@/lib/landing/meta";
import { buttonClass } from "@/components/customer/kit/button-class";

export const metadata: Metadata = pageMeta("Reviews | Tiffin Grab", "Real Google reviews from Tiffin Grab customers across the Greater Toronto Area.", "/reviews");

// Plugin config (installed, place id) is read from the DB per request.
export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const [summary, cfg] = await Promise.all([
    getReviewsSummary(integrationsConfigReadStore),
    getGoogleReviewsConfig(integrationsConfigReadStore),
  ]);
  // Not connected (or Google returned nothing): the page does not exist, same as every other review spot.
  if (!summary || summary.reviews.length === 0) notFound();
  const writeUrl = cfg.installed && cfg.placeId ? writeReviewUrl(cfg.placeId) : null;

  return (
    <div className="tg-reviews">
      {/* Soft saffron and green light for the glass to refract; decoration only. */}
      <div aria-hidden className="tg-reviews__glow" />
      <div className="tg-wrap tg-section relative">
        <PageIntro eyebrow="Google reviews" title={<>Said by people who <span className="c-accent">eat it.</span></>} lede="Straight from our Google listing, word for word." />

        <div className="flex flex-col gap-12">
          <section aria-label="Overall rating" className="tg-reviews__hero c-liquid">
            <div className="flex items-center gap-5">
              <span className="tg-reviews__score tabular-nums">{summary.rating.toFixed(1)}</span>
              <div className="flex flex-col gap-1.5">
                <ReviewStars value={summary.rating} size={22} />
                <span className="c-caption tabular-nums">{summary.total} reviews on Google</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
              {writeUrl ? <a href={writeUrl} target="_blank" rel="noreferrer" className={buttonClass({ variant: "glass-prominent", size: "lg" })}>Write a review</a> : null}
              {summary.attributionUrl ? <a href={summary.attributionUrl} target="_blank" rel="noreferrer" className={buttonClass({ variant: "glass", size: "lg" })}>See all on Google</a> : null}
            </div>
          </section>

          {/* Columns, not a grid: reviews vary in length, so cards stack like a masonry wall. */}
          <div className="columns-1 gap-4 md:columns-2 lg:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid">
            {summary.reviews.map((r, i) => <ReviewCard key={`${r.author}-${i}`} review={r} glass />)}
          </div>

          {/* Separate Google calls per photo: stream in after the reviews. */}
          <Suspense fallback={null}><ReviewPhotos /></Suspense>
        </div>
      </div>
    </div>
  );
}
