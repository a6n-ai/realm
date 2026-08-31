import { StarIcon } from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import type { ReviewsSummary } from "../types";

/**
 * The fill colour is an explicit value, not a Tailwind palette class: the CRM
 * theme ships its own tokens and has no `amber`, so `fill-amber-400` resolved to
 * nothing and every star rendered as an empty outline.
 */
const STAR_GOLD = "#f59e0b";

function Stars({ value }: { value: number }) {
  const filled = Math.round(value);
  return (
    <span className="flex items-center gap-0.5" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon
          key={n}
          aria-hidden
          className={n <= filled ? "size-3.5" : "text-muted-foreground/40 size-3.5"}
          style={n <= filled ? { fill: STAR_GOLD, color: STAR_GOLD } : undefined}
        />
      ))}
    </span>
  );
}

/**
 * The reviews Google is currently returning, for staff to read in admin.
 *
 * Read-only by necessity, not by choice: the Places API returns at most five
 * reviews, in an order Google picks, and has no reply endpoint. Replying and
 * the full list arrive with the Business Profile provider.
 */
export function GoogleReviewsList({ summary }: { summary: ReviewsSummary | null }) {
  if (!summary) {
    return (
      <p className="text-muted-foreground text-sm">
        Nothing to show yet — save a Place ID above, and reviews appear here once Google returns
        them.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Stars value={summary.rating} />
        <span className="text-lg font-semibold tabular-nums">{summary.rating.toFixed(1)}</span>
        <span className="text-muted-foreground text-sm tabular-nums">
          {summary.total} reviews on Google
        </span>
        {summary.attributionUrl ? (
          <a
            href={summary.attributionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary text-sm underline underline-offset-4"
          >
            View listing
          </a>
        ) : null}
      </div>

      {summary.reviews.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Google returned a rating but no review text for this listing.
        </p>
      ) : (
        <ul className="space-y-3">
          {summary.reviews.map((r, i) => (
            <li key={`${r.author}-${i}`} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-medium">{r.author}</span>
                  <Stars value={r.rating} />
                </span>
                <span className="text-muted-foreground text-xs">{r.relativeTime}</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed whitespace-pre-line">{r.text}</p>
            </li>
          ))}
        </ul>
      )}

      {/* Say the cap out loud: five is Google's limit, not a bug in this page. */}
      <p className="text-muted-foreground text-xs">
        Showing {summary.reviews.length} of {summary.total}. The Places API returns at most five
        reviews and cannot reply to them; both arrive with Business Profile access.
      </p>
    </div>
  );
}
