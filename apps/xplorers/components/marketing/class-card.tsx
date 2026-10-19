import { CATEGORY_LABELS, type PublicClass } from "@/lib/sessions/format";
import { Button, Pill } from "@/components/marketing/ui";

/** The admin's class colours map onto the site's programme palette hooks. */
const COLOR_TONE: Record<string, string> = {
  sky: "explore",
  blue: "scientist",
  purple: "sensory",
  pink: "private",
  orange: "bake",
  green: "wood",
  yellow: "camps",
};

export function ClassCard({ item }: { item: PublicClass }) {
  const enquire = item.bookingType === "enquire_only";
  const href = enquire ? `/contact?class=${encodeURIComponent(item.title)}` : `/classes/${item.publicId}`;
  const meta = [item.audience, item.groupSize].filter(Boolean).join(" · ");
  return (
    <article className="xl-card" data-programme={COLOR_TONE[item.color] ?? "private"}>
      {item.photos[0] ? (
        // Uploaded class photos, not the static marketing set.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="xl-card-photo" src={item.photos[0]} alt={item.title} loading="lazy" />
      ) : null}
      <div className="xl-card-head">
        <Pill>{CATEGORY_LABELS[item.category]}</Pill>
        {item.nextDate ? <span className="xl-card-next">Next: {item.nextDate}</span> : null}
      </div>
      <div className="xl-card-body">
        <h3 className="xl-card-title">{item.title}</h3>
        {item.scheduleLine || meta ? (
          <p className="xl-card-when">
            {item.scheduleLine}
            {meta ? <span>{meta}</span> : null}
          </p>
        ) : null}
        {item.summary ? <p className="xl-card-desc">{item.summary}</p> : null}
        {item.included ? <p className="xl-card-desc">{item.included}</p> : null}
        <div className="xl-card-foot">
          <p className="xl-card-price">{item.priceLine}</p>
          <Button block icon="arrow-up-right" href={href}>
            {enquire ? "Enquire" : item.sessions.length ? "Book now" : "See details"}
          </Button>
        </div>
      </div>
    </article>
  );
}
