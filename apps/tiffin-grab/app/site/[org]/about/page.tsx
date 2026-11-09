import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BreadcrumbSchema } from "@/components/landing/breadcrumb-schema";
import { PageIntro } from "@/components/landing/public-shell";
import { BuildTiffinLink } from "@/components/landing/build-tiffin-link";
import { summaryOrNull } from "@/components/landing/landing-reviews";
import { pageMeta } from "@/lib/landing/meta";
import { jsonLdScript } from "@/lib/landing/business-jsonld";
import { loadSiteFacts } from "@/lib/landing/site-facts";
import { deliveryLine, dropOffNote } from "@/lib/landing/llms-text";
import { loadKitchenCounts, roundedCount } from "@/lib/landing/kitchen-counts";
import { shortMoney } from "@/lib/landing/live-figures";
import { publicOrigin } from "@/lib/routing/apex";
// .lp-band (the closing call to action) lives with the pricing styles.
import "@/components/landing/styles/pricing.css";

export const metadata: Metadata = pageMeta(
  "About Tiffin Grab: Home-Style Tiffins Across the GTA",
  "Tiffin Grab cooks dal, sabzi and roti in small batches every morning and delivers them free across the Greater Toronto Area, Monday to Friday.",
  "/about",
);
export const revalidate = 3600;
export const dynamic = "error";

const and = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

// Every figure here is live (kitchen counts, catalog, Google): no founding year, names or certificates until the owner
// supplies them, so nothing on the page can go stale or overclaim.
export default async function AboutPage() {
  const [facts, counts, reviews] = await Promise.all([loadSiteFacts(), loadKitchenCounts(), summaryOrNull()]);
  const origin = publicOrigin();
  const stats = [
    counts && counts.tiffins > 0 ? { n: roundedCount(counts.tiffins), label: "tiffins delivered" } : null,
    counts && counts.households > 0 ? { n: roundedCount(counts.households), label: "GTA households fed" } : null,
    facts.areas.length ? { n: String(facts.areas.length), label: "delivery areas" } : null,
    reviews && reviews.total > 0 ? { n: `${reviews.rating.toFixed(1)}★`, label: `on Google, from ${reviews.total} reviews` } : null,
  ].filter((s): s is { n: string; label: string } => s != null);

  const steps = [
    { title: "Cooked in the morning", body: "Dal, sabzi and roti, cooked in small batches the morning they go out." },
    { title: "Packed the same day", body: "Each tiffin is packed for one person and one day, in the size you picked." },
    {
      title: "Delivered in your window",
      body: `Monday to Friday${facts.runs.length ? `, in one of ${facts.runs.length} delivery windows set by your postal code` : ""}. Weekend tiffins come with Friday's delivery.`,
    },
    {
      title: "Changed the night before",
      body: `Pause, skip or move any day${facts.cutoff ? ` until ${facts.cutoff} the night before` : " before its cutoff"}.`,
    },
  ];

  const promises = [
    facts.free ? { title: "Free delivery", body: `No delivery fee, on every plan.${dropOffNote(facts)}` } : { title: "Delivery shown up front", body: deliveryLine(facts) },
    facts.from != null
      ? { title: "One price per tiffin", body: `From ${shortMoney(facts.from, facts.currency)} a tiffin${facts.biggestOff ? `, up to ${facts.biggestOff}% off on longer plans` : ""}. You see the total before you pay.` }
      : null,
    { title: "Veg and non-veg", body: "Every meal size lists what is in it and its calories, so you know what arrives." },
  ].filter((p): p is { title: string; body: string } => p != null);

  const aboutLd = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    "@id": `${origin}/about`,
    url: `${origin}/about`,
    name: "About Tiffin Grab",
    about: { "@id": `${origin}/#business` },
  };

  return (
    <div className="lp-wrap lp-section flex flex-col gap-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(aboutLd) }} />
      <BreadcrumbSchema name="About" path="/about" />
      <PageIntro
        eyebrow="About Tiffin Grab"
        title={<>Home food, cooked <span className="c-accent">this morning.</span></>}
        lede="We cook dal, sabzi and roti in small batches every morning, pack them the same day and bring them to your door across the Greater Toronto Area."
      />

      {stats.length ? (
        <section aria-label="Tiffin Grab in numbers">
          <ul className="grid list-none grid-cols-2 gap-3 p-0 lg:grid-cols-4">
            {stats.map((s) => (
              <li key={s.label} className="lp-tile gap-1">
                <strong className="text-[clamp(32px,4vw,48px)] leading-none font-bold tracking-[-0.04em] text-(--primary-text,var(--primary)) tabular-nums">{s.n}</strong>{" "}
                <span className="text-sm text-muted-foreground">{s.label}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="about-day" className="flex flex-col gap-6">
        <h2 id="about-day" className="lp-h2">How a tiffin gets <span className="c-accent">to you.</span></h2>
        <ol className="grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.title} className="lp-tile gap-2">
              <span className="lp-kicker">Step {i + 1}</span>{" "}
              <h3 className="lp-tile__title">{s.title}</h3>{" "}
              <p className="m-0 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="about-promise" className="flex flex-col gap-6">
        <h2 id="about-promise" className="lp-h2">What you can <span className="c-accent">count on.</span></h2>
        <ul className="lp-list max-w-[820px]">
          {promises.map((p) => (
            <li key={p.title} className="lp-list__row">
              <span>
                <strong>{p.title}</strong>{" "}
                <span className="text-sm text-muted-foreground">{p.body}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {facts.areas.length ? (
        <section aria-labelledby="about-areas" className="flex max-w-[820px] flex-col gap-4">
          <h2 id="about-areas" className="lp-h2">Where we <span className="c-accent">deliver.</span></h2>
          <p className="lp-lede">{facts.areas.length} areas across the GTA today: {and(facts.areas)}.</p>
          <div className="lp-actions lp-actions--start">
            <Link href="/locations" className="lp-textlink">Check your area on the map<ArrowRight aria-hidden className="size-4" strokeWidth={2} /></Link>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="about-band" className="lp-band">
        <h2 id="about-band" className="lp-h2">Ready when <span className="c-accent">you are.</span></h2>
        <p className="lp-lede">Pick your meal size and days. You see the total before you pay.</p>
        <div className="lp-actions lp-actions--start">
          <BuildTiffinLink href="/subscribe" className="lp-cta">Build my tiffin<ArrowRight aria-hidden className="size-4" strokeWidth={2.2} /></BuildTiffinLink>
          <Link href="/menu" className="lp-textlink">This week&apos;s menu<ArrowRight aria-hidden className="size-4" strokeWidth={2} /></Link>
        </div>
      </section>
    </div>
  );
}
