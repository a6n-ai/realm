import { StarIcon } from "lucide-react";
import { getReviewsSummary } from "@realm/google-reviews";
import { integrationsConfigStore } from "@/lib/services/app-settings.service";
import { Section } from "./section";

export async function GoogleReviewsSection() {
  const summary = await getReviewsSummary(integrationsConfigStore);
  if (!summary || summary.reviews.length === 0) return null;

  return (
    <Section className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">What customers say</h2>
        {/* attributionUrl can be "" (Google omitted googleMapsUri) — an empty href
            would silently reload the current page, so fall back to plain text. */}
        {summary.attributionUrl ? (
          <a
            href={summary.attributionUrl}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground text-sm underline"
          >
            {summary.rating.toFixed(1)}★ from {summary.total} Google reviews
          </a>
        ) : (
          <span className="text-muted-foreground text-sm">
            {summary.rating.toFixed(1)}★ from {summary.total} Google reviews
          </span>
        )}
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {summary.reviews.map((r, i) => (
          <figure key={`${r.author}-${i}`} className="hover-lift card-glow rounded-lg border p-6">
            <div className="mb-3 flex gap-0.5 text-primary" aria-label={`${r.rating} out of 5`}>
              {Array.from({ length: r.rating }).map((_, s) => (
                <StarIcon key={s} className="size-4 fill-current" />
              ))}
            </div>
            <blockquote className="text-sm leading-relaxed">{r.text}</blockquote>
            <figcaption className="text-muted-foreground mt-4 text-xs">
              {r.author}
              {r.relativeTime ? ` · ${r.relativeTime}` : null} · Google Review
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  );
}
