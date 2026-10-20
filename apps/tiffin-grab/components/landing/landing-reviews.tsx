import { getReviewsSummary } from "@foundry/google-reviews";
import { integrationsConfigStore } from "@/lib/services/app-settings.service";

// Real Google reviews only; without any, the section is not rendered at all.
export async function LandingReviews() {
  const summary = await getReviewsSummary(integrationsConfigStore);
  if (!summary || summary.reviews.length === 0) return null;
  const score = `${summary.rating.toFixed(1)} out of 5 from ${summary.total} Google reviews`;

  return (
    <section className="tg-section" aria-labelledby="tg-reviews">
      <div className="tg-wrap">
        <span className="c-eyebrow">Google reviews</span>
        <h2 id="tg-reviews" className="tg-h2">Said by people who <span className="c-accent">eat it.</span></h2>
        <p className="c-caption mt-4">
          {summary.attributionUrl ? (
            <a href={summary.attributionUrl} target="_blank" rel="noreferrer" className="tg-link">{score}</a>
          ) : score}
        </p>
        <div className="mt-10 grid gap-3 md:grid-cols-3">
          {summary.reviews.slice(0, 3).map((r, i) => (
            <figure key={`${r.author}-${i}`} className="tg-card m-0 flex flex-col gap-4 p-6">
              <blockquote className="c-body m-0">{r.text}</blockquote>
              <figcaption className="c-caption">
                {r.author}
                {r.relativeTime ? `, ${r.relativeTime}` : null}. {r.rating} of 5 on Google.
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
