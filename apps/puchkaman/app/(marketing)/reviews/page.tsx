import type { Metadata } from "next";
import Image from "next/image";
import { PageBanner, Pill, Stars } from "@/components/brutal/shared";
import { Reveal } from "@/components/brutal/reveal";
import { MAP_DIRECTIONS_URL } from "@/lib/links";
import { buildMetadata, breadcrumbJsonLd } from "@/lib/seo";
import { getReviewsSummary } from "@foundry/google-reviews";
import { integrationsConfigStore } from "@/lib/services/integrations.service";

export const metadata: Metadata = buildMetadata({
  title: "Reviews — Puchkaman Scarborough",
  description: "What Scarborough says about Puchkaman — real Google reviews from the neighbourhood.",
  path: "/reviews",
});

const breadcrumb = breadcrumbJsonLd([
  { name: "Home", path: "/" },
  { name: "Reviews", path: "/reviews" },
]);

// force-dynamic: reads plugin config (installed? place id? API key?) from the DB each request.
export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const summary = await getReviewsSummary(integrationsConfigStore);

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <PageBanner
        kicker="Social Proof"
        title="Reviews"
        sub="What Scarborough says about Puchkaman."
        bg="var(--page-bg)"
        color="var(--ink)"
        surface="surface-yellow"
        crumb="Reviews"
      />

      <section className="section-pad" style={{ background: "var(--paper)" }}>
        <div className="wrap" style={{ maxWidth: 960 }}>
          {summary && summary.reviews.length > 0 ? (
            <>
              <Reveal>
                <div className="card" style={{ padding: 26, marginBottom: 32, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  <Stars value={summary.rating} size={26} />
                  <span className="display" style={{ fontSize: "2rem" }}>{summary.rating.toFixed(1)}</span>
                  <span className="mono" style={{ fontSize: "0.85rem", opacity: 0.7 }}>{summary.total}+ Google reviews</span>
                  <a href={summary.attributionUrl} target="_blank" rel="noopener noreferrer" className="pill pill--green" style={{ marginLeft: "auto" }}>
                    See on Google ↗
                  </a>
                </div>
              </Reveal>

              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))" }}>
                {summary.reviews.map((rv, i) => (
                  <Reveal key={`${rv.author}-${i}`} delay={i * 60}>
                    <div className="card" style={{ padding: 24, height: "100%" }}>
                      <Stars value={rv.rating} size={18} />
                      <p style={{ fontWeight: 600, fontSize: "1.05rem", margin: "14px 0 18px", lineHeight: 1.5 }}>&ldquo;{rv.text}&rdquo;</p>
                      <div className="flex center" style={{ gap: 10 }}>
                        {rv.profilePhotoUrl ? (
                          <Image
                            src={rv.profilePhotoUrl}
                            alt=""
                            width={40}
                            height={40}
                            style={{ borderRadius: "50%", border: "2.5px solid var(--ink)" }}
                          />
                        ) : (
                          <span
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: "50%",
                              background: "var(--yellow)",
                              border: "2.5px solid var(--ink)",
                              display: "grid",
                              placeItems: "center",
                              fontWeight: 900,
                            }}
                          >
                            {rv.author[0]}
                          </span>
                        )}
                        <div>
                          <div style={{ fontWeight: 800 }}>
                            {rv.authorUrl ? (
                              <a href={rv.authorUrl} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
                                {rv.author}
                              </a>
                            ) : (
                              rv.author
                            )}
                          </div>
                          <div className="mono" style={{ fontSize: "0.7rem", opacity: 0.6 }}>
                            {rv.relativeTime}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>

              <div className="tac" style={{ marginTop: 32 }}>
                <a href={summary.attributionUrl} target="_blank" rel="noopener noreferrer" className="btn btn--ink">
                  Leave a review on Google ↗
                </a>
              </div>
            </>
          ) : (
            <Reveal>
              <div className="card card--cream" style={{ padding: "clamp(22px,3vw,32px)", textAlign: "center" }}>
                <Pill variant="ink">Reviews unavailable</Pill>
                <p style={{ fontWeight: 600, fontSize: "1.15rem", margin: "16px 0" }}>
                  Reviews aren&apos;t available right now — check back soon.
                </p>
                <a href={MAP_DIRECTIONS_URL} target="_blank" rel="noopener noreferrer" className="btn btn--ink">
                  Get Directions ↗
                </a>
              </div>
            </Reveal>
          )}
        </div>
      </section>
    </div>
  );
}
