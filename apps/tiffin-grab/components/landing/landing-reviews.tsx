import Link from "next/link";
import { Star } from "lucide-react";
import { getGoogleReviewsConfig, getReviewsSummary, loadPlacesApiKeyFromEnv, type Review } from "@foundry/google-reviews";
import { integrationsConfigReadStore } from "@/lib/services/app-settings.service";

/** Plugin installed, listing set and key present. Cheap (no Google call): gates links, not content. */
export async function reviewsConnected(): Promise<boolean> {
  const cfg = await getGoogleReviewsConfig(integrationsConfigReadStore).catch(() => null);
  return Boolean(cfg?.installed && cfg.placeId && loadPlacesApiKeyFromEnv());
}

export function ReviewStars({ value, size = 16 }: { value: number; size?: number }) {
  const filled = Math.round(value);
  return (
    <span className="inline-flex items-center gap-0.5 text-primary" role="img" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} aria-hidden width={size} height={size} strokeWidth={1.75} className={n <= filled ? "fill-current" : "opacity-30"} />
      ))}
    </span>
  );
}

export function ReviewCard({ review, clamp = false }: { review: Review; clamp?: boolean }) {
  return (
    <figure className="tg-card m-0 flex h-full flex-col gap-4 p-6">
      <ReviewStars value={review.rating} />
      <blockquote className={`c-body m-0 whitespace-pre-line ${clamp ? "line-clamp-6" : ""}`}>{review.text}</blockquote>
      <figcaption className="c-caption mt-auto">
        {review.authorUrl ? (
          <a href={review.authorUrl} target="_blank" rel="noreferrer" className="tg-link">{review.author}</a>
        ) : review.author}
        {review.relativeTime ? `, ${review.relativeTime}` : null}. On Google.
      </figcaption>
    </figure>
  );
}

// Hero line under the CTAs. Renders nothing until Google returns a rating.
export async function HeroRating() {
  const summary = await getReviewsSummary(integrationsConfigReadStore);
  if (!summary || summary.total === 0) return null;
  return (
    <Link href="/reviews" className="tg-link--tap inline-flex items-center gap-2 text-sm font-semibold no-underline">
      <ReviewStars value={summary.rating} />
      <span className="tabular-nums">{summary.rating.toFixed(1)} on Google</span>
      <span className="c-caption tabular-nums">{summary.total} reviews</span>
    </Link>
  );
}

// Real Google reviews only; without any, the section is not rendered at all.
export async function LandingReviews() {
  const summary = await getReviewsSummary(integrationsConfigReadStore);
  if (!summary || summary.reviews.length === 0) return null;
  const score = `${summary.rating.toFixed(1)} out of 5 from ${summary.total} Google reviews`;

  return (
    <section className="tg-section" aria-labelledby="tg-reviews">
      <div className="tg-wrap">
        <span className="c-eyebrow">Google reviews</span>
        <h2 id="tg-reviews" className="tg-h2">Said by people who <span className="c-accent">eat it.</span></h2>
        <p className="c-caption mt-4 flex flex-wrap items-center gap-2">
          <ReviewStars value={summary.rating} />
          {summary.attributionUrl ? (
            <a href={summary.attributionUrl} target="_blank" rel="noreferrer" className="tg-link">{score}</a>
          ) : score}
        </p>
        <div className="mt-10 grid gap-3 md:grid-cols-3">
          {summary.reviews.slice(0, 3).map((r, i) => <ReviewCard key={`${r.author}-${i}`} review={r} clamp />)}
        </div>
        <p className="mt-6"><Link href="/reviews" className="tg-link tg-link--tap">Read every review</Link></p>
      </div>
    </section>
  );
}
