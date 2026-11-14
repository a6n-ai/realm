import Link from "next/link";
import { Star } from "lucide-react";
import { getGoogleReviewsConfig, getReviewsSummary, loadPlacesApiKeyFromEnv, type Review } from "@foundry/google-reviews";
import { integrationsConfigReadStore } from "@/lib/payments/integrations-config";
import { getPlacePhotos } from "@/lib/landing/place-photos";

/** Plugin installed, listing set and key present. Cheap (no Google call): gates links, not content. */
export async function reviewsConnected(): Promise<boolean> {
  const cfg = await getGoogleReviewsConfig(integrationsConfigReadStore).catch(() => null);
  return Boolean(cfg?.installed && cfg.placeId && loadPlacesApiKeyFromEnv());
}

// Null on any failure: the header renders on static pages that prerender at build, with no DB.
export const summaryOrNull = () => getReviewsSummary(integrationsConfigReadStore).catch(() => null);

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
  const summary = await summaryOrNull();
  if (!summary || summary.total === 0) return null;
  return (
    // No aria-label: the accessible name must contain the visible "4.5" (WCAG 2.5.3), so the
    // rest of the sentence is screen-reader-only text around it. The Google "G" says where the
    // rating comes from; the review count lives on the hero line and /reviews.
    <Link href="/reviews" className="tg-rating c-liquid">
      <Star aria-hidden width={15} height={15} strokeWidth={1.75} className="fill-current text-primary" />
      <span className="sr-only">Rated </span>
      <span className="tabular-nums">{summary.rating.toFixed(1)}</span>
      <span className="sr-only"> out of 5 from {summary.total} reviews on Google</span>
      <GoogleG />
    </Link>
  );
}

// Hero line under the CTAs. Renders nothing until Google returns a rating.
export async function HeroRating() {
  const summary = await summaryOrNull();
  if (!summary || summary.total === 0) return null;
  return (
    <Link href="/reviews" className="tg-link--tap inline-flex items-center gap-2 text-sm font-semibold no-underline">
      <ReviewStars value={summary.rating} />
      <span className="tabular-nums">{summary.rating.toFixed(1)} on Google</span>
      <span className="tabular-nums font-medium opacity-80">· {summary.total} reviews</span>
    </Link>
  );
}

// Real Google reviews only; without any, the section is not rendered at all.
export async function LandingReviews({ withPhotos = false }: { withPhotos?: boolean } = {}) {
  const summary = await summaryOrNull();
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
              <img src={p.url} alt={`Customer photo of Tiffin Grab food, shared by ${p.author}`} width={p.width} height={p.height} loading="lazy" referrerPolicy="no-referrer" className="aspect-square w-full rounded-2xl object-cover" />
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

/** Google's four-colour "G" (brand mark), sized to sit beside the rating. */
function GoogleG() {
  return (
    <svg aria-hidden focusable="false" viewBox="0 0 48 48" width={16} height={16} className="tg-rating__g">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59A14.5 14.5 0 0 1 9.5 24c0-1.59.28-3.14.76-4.59l-7.98-6.19A23.94 23.94 0 0 0 0 24c0 3.77.9 7.35 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
