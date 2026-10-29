import Link from "next/link";
import { ArrowUpRightIcon } from "lucide-react";
import { CATEGORY_LABELS, type PublicClass } from "@/lib/sessions/format";
import "./class-card.css";

/** The admin's class colours map onto the programme palette hooks. */
const COLOR_TONE: Record<string, string> = {
  sky: "explore",
  blue: "scientist",
  purple: "sensory",
  pink: "private",
  orange: "bake",
  green: "wood",
  yellow: "camps",
};

/**
 * One card for the public site, /me and the dashboard; `href` is where Book goes (enquire-only classes always go to contact).
 * Every card is the same height: copy is clamped and the whole card opens the class page, where the full text lives.
 */
export function ClassCard({ item, href }: { item: PublicClass; href?: string }) {
  const details = `/classes/${item.publicId}`;
  const enquire = item.bookingType === "enquire_only";
  const to = enquire ? `/contact?class=${encodeURIComponent(item.title)}` : (href ?? details);
  const meta = [item.audience, item.groupSize].filter(Boolean).join(" · ");
  return (
    <article className="xl-card" data-programme={COLOR_TONE[item.color] ?? "private"}>
      {item.photos[0] ? (
        // Uploaded class photos, not the static marketing set.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="xl-card-photo" src={item.photos[0]} alt={item.title} loading="lazy" />
      ) : null}
      <div className="xl-card-head">
        <span className="xl-card-pill">{CATEGORY_LABELS[item.category]}</span>
        {item.nextDate ? <span className="xl-card-next">Next: {item.nextDate}</span> : null}
      </div>
      <div className="xl-card-body">
        <h3 className="xl-card-title">
          <Link href={details} className="xl-card-link">
            {item.title}
          </Link>
        </h3>
        {item.scheduleLine || meta ? (
          <p className="xl-card-when">
            {item.scheduleLine}
            {meta ? <span>{meta}</span> : null}
          </p>
        ) : null}
        {item.summary ? <p className="xl-card-desc">{item.summary}</p> : null}
        <div className="xl-card-foot">
          <p className="xl-card-price">{item.priceLine}</p>
          <Link className="xl-card-btn" href={to}>
            {enquire ? "Enquire" : item.sessions.length ? "Book now" : "See details"}
            <ArrowUpRightIcon size={17} strokeWidth={2.2} aria-hidden />
          </Link>
        </div>
      </div>
    </article>
  );
}
