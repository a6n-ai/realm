import type { SessionCategory } from "@/db/schema/studio";
import { CATEGORY_LABELS, type PublicClass } from "@/lib/sessions/format";
import { Button, Pill } from "@/components/marketing/ui";

/** Reuses the programme palette so classes sit in the site's colour system. */
const CATEGORY_TONE: Record<SessionCategory, string> = {
  kids: "explore",
  adults: "wood",
  birthday: "bake",
  school: "scientist",
  drop_in: "sensory",
  private: "private",
  other: "camps",
};

export function ClassCard({ item }: { item: PublicClass }) {
  const href = `/classes/${item.publicId}`;
  return (
    <article className="xl-card" data-programme={CATEGORY_TONE[item.category]}>
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
        {item.audience || item.location ? (
          <p className="xl-card-when">{[item.audience, item.location].filter(Boolean).join(" · ")}</p>
        ) : null}
        {item.description ? <p className="xl-card-desc">{item.description}</p> : null}
        <div className="xl-card-foot">
          <p className="xl-card-price">{item.price}</p>
          <Button block icon="arrow-up-right" href={href}>
            {item.sessions.length ? "Book now" : "See details"}
          </Button>
        </div>
      </div>
    </article>
  );
}
