import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { SITE_NAME } from "@/lib/brand";
import { buildMetadata } from "@/lib/seo";
import { SessionList } from "@/components/marketing/session-list";
import { Button, Eyebrow, Notice, Pill, stagger } from "@/components/marketing/ui";
import { getSession } from "@/lib/auth/session";
import { CATEGORY_LABELS } from "@/lib/sessions/format";
import { bookHref, loadPublicClasses } from "@/lib/sessions/public";

type Params = Promise<{ id: string }>;

async function findClass(id: string) {
  return (await loadPublicClasses()).find((c) => c.publicId === id);
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const item = await findClass(id);
  return buildMetadata({
    title: `${item?.title ?? "Class"} · ${SITE_NAME}`,
    description: item?.summary || "A class at Xplorers.Life. Pick a date and book a seat.",
    path: `/classes/${id}`,
  });
}

export default async function ClassPage({ params }: { params: Params }) {
  const { id } = await params;
  const [item, session] = await Promise.all([findClass(id), getSession()]);
  if (!item) notFound();
  const signedIn = Boolean(session?.user);

  return (
    <article>
      <header className="xl-page-hero">
        <div className="xl-wrap">
          <Eyebrow dot style={stagger(0)}>
            {CATEGORY_LABELS[item.category]}
          </Eyebrow>
          <h1 className="xl-display" style={stagger(1)}>
            {item.title}
          </h1>
          {item.summary ? (
            <p className="xl-lede xl-justify" style={stagger(2)}>
              {item.summary}
            </p>
          ) : null}
          <div className="xl-row" style={stagger(3)}>
            {[item.audience, item.groupSize, item.location, item.priceLine].filter(Boolean).map((t) => (
              <Pill key={t}>{t}</Pill>
            ))}
          </div>
        </div>
      </header>
      <section className="xl-wrap xl-section xl-stack" style={{ "--gap": "28px" } as CSSProperties}>
        {item.photos.length ? (
          <ul className="xl-photos">
            {item.photos.map((url, i) => (
              <li key={url}>
                {/* Uploaded class photos, not the static marketing set. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={i === 0 ? item.title : ""} loading="lazy" />
              </li>
            ))}
          </ul>
        ) : null}
        {item.included ? (
          <div className="xl-panel xl-stack">
            <h2 className="xl-day-label">What&rsquo;s included</h2>
            <p className="xl-body xl-justify">{item.included}</p>
          </div>
        ) : null}
        <div className="xl-panel">
          <h2 className="xl-day-label">Book a date</h2>
          {item.bookingType === "enquire_only" ? (
            <div className="xl-stack">
              <p className="xl-body">Dates and pricing for this one are shared on request.</p>
              <div className="xl-row">
                <Button href={`/contact?class=${encodeURIComponent(item.title)}`}>Enquire</Button>
              </div>
            </div>
          ) : item.sessions.length ? (
            <SessionList
              rows={item.sessions}
              hidePhotos
              action={(row) => (
                <Button size="xs" variant="secondary" href={bookHref(row.publicId, signedIn)}>
                  {row.remaining > 0 ? "Book" : "Details"}
                </Button>
              )}
            />
          ) : (
            <div className="xl-stack">
              <p className="xl-body">No dates are scheduled yet. Tell us you&rsquo;re interested and we&rsquo;ll let you know.</p>
              <div className="xl-row">
                <Button href={`/contact?class=${encodeURIComponent(item.title)}`}>Ask about this class</Button>
              </div>
            </div>
          )}
        </div>
        <Notice icon={Users}>Older siblings are welcome to join too. Please share their ages when booking.</Notice>
      </section>
    </article>
  );
}
