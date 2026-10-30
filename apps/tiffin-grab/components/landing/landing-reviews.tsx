import Link from "next/link";
import { Star } from "lucide-react";
import { getGoogleReviewsConfig, getReviewsSummary, loadPlacesApiKeyFromEnv, type Review } from "@foundry/google-reviews";
import { integrationsConfigReadStore } from "@/lib/services/app-settings.service";
import { getPlacePhotos } from "@/lib/landing/place-photos";

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

function ReviewAvatar({ review }: { review: Review }) {
  if (!review.profilePhotoUrl) {
    return (
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold text-foreground">
        {review.author.charAt(0).toUpperCase()}
      </span>
    );
  }
  // Plain <img>: googleusercontent avatars are not in next/image remotePatterns, and
  // no-referrer avoids Google's hotlink 403 on some avatar hosts.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={review.profilePhotoUrl} alt="" width={40} height={40} loading="lazy" referrerPolicy="no-referrer" className="size-10 shrink-0 rounded-full object-cover" />;
}

/** `glass` is the /reviews page card: liquid glass, justified text, a lift on hover. */
export function ReviewCard({ review, clamp = false, glass = false }: { review: Review; clamp?: boolean; glass?: boolean }) {
  return (
    <figure className={glass ? "tg-review-glass m-0 flex flex-col gap-4 p-6" : "tg-card m-0 flex h-full flex-col gap-4 p-6"}>
      <ReviewStars value={review.rating} />
      <blockquote lang="en" className={`c-body m-0 whitespace-pre-line ${clamp ? "line-clamp-6" : ""} ${glass ? "text-justify hyphens-auto" : ""}`}>{review.text}</blockquote>
      <figcaption className="c-caption mt-auto flex items-center gap-3">
        <ReviewAvatar review={review} />
        <span>
          {review.authorUrl ? (
            <a href={review.authorUrl} target="_blank" rel="noreferrer" className="tg-link">{review.author}</a>
          ) : review.author}
          {review.relativeTime ? `, ${review.relativeTime}` : null}. On Google.
        </span>
      </figcaption>
    </figure>
  );
}

// Navbar capsule: the overall rating, one tap from the reviews page.
export async function NavRating() {
  const summary = await getReviewsSummary(integrationsConfigReadStore);
  if (!summary || summary.total === 0) return null;
  return (
    <Link href="/reviews" className="tg-rating c-liquid" aria-label={`Rated ${summary.rating.toFixed(1)} out of 5 from ${summary.total} Google reviews`}>
      <Star aria-hidden width={15} height={15} strokeWidth={1.75} className="fill-current text-primary" />
      <span className="tabular-nums">{summary.rating.toFixed(1)}</span>
      <span className="tg-rating__count tabular-nums">{summary.total}</span>
    </Link>
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
export async function LandingReviews({ withPhotos = false }: { withPhotos?: boolean } = {}) {
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
        {withPhotos ? <div className="mt-12"><ReviewPhotos limit={4} /></div> : null}
      </div>
    </section>
  );
}

// Listing photos from Google. Each one carries its uploader's name, as Google requires.
export async function ReviewPhotos({ limit = 8 }: { limit?: number }) {
  const photos = await getPlacePhotos(limit);
  if (photos.length === 0) return null;
  return (
    <div className="flex flex-col gap-4">
      <h2 className="tg-h2">From our <span className="c-accent">Google listing.</span></h2>
      <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-4">
        {photos.map((p) => (
          <li key={p.url}>
            <figure className="m-0 flex flex-col gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- key-free googleusercontent URL, not in remotePatterns */}
              <img src={p.url} alt="" width={p.width} height={p.height} loading="lazy" referrerPolicy="no-referrer" className="aspect-square w-full rounded-2xl object-cover" />
              <figcaption className="c-caption truncate">
                Photo:{" "}
                {p.authorUrl ? <a href={p.authorUrl} target="_blank" rel="noreferrer" className="tg-link">{p.author}</a> : p.author}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </div>
  );
}
