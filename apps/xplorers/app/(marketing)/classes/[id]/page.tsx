import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Role } from "@foundry/commons";
import { Users } from "lucide-react";
import { SITE_NAME } from "@/lib/brand";
import { buildMetadata } from "@/lib/seo";
import { BookControl } from "@/components/marketing/book-control";
import { SessionList } from "@/components/marketing/session-list";
import { Button, Eyebrow, Notice, Pill, stagger } from "@/components/marketing/ui";
import { getSession } from "@/lib/auth/session";
import { bookingsService } from "@/lib/services/bookings.service";
import { walletService } from "@/lib/services/wallet.service";
import { CATEGORY_LABELS } from "@/lib/sessions/format";
import { loadPublicClasses } from "@/lib/sessions/public";

type Params = Promise<{ id: string }>;

async function findClass(id: string) {
  return (await loadPublicClasses()).find((c) => c.publicId === id);
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const item = await findClass(id);
  return buildMetadata({
    title: `${item?.title ?? "Class"} · ${SITE_NAME}`,
    description: item?.description ?? "A class at Xplorers.Life. Pick a date and book a seat.",
    path: `/classes/${id}`,
  });
}

export default async function ClassPage({ params }: { params: Params }) {
  const { id } = await params;
  const [item, session] = await Promise.all([findClass(id), getSession()]);
  if (!item) notFound();
  const signedIn = Boolean(session?.user);
  const isFamily = session?.user?.role === Role.USER;
  const bookedIds = new Set(
    isFamily && session?.user ? await bookingsService.listConfirmedOccurrencePublicIds(session.user.id) : [],
  );
  const coins = isFamily && session?.user ? await walletService.coinsForFamily(session.user.id) : null;

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
          {item.description ? (
            <p className="xl-lede" style={stagger(2)}>
              {item.description}
            </p>
          ) : null}
          <div className="xl-row" style={stagger(3)}>
            {[item.audience, item.location, item.price].filter(Boolean).map((t) => (
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
        <div className="xl-panel">
          <h2 className="xl-day-label">Book a date</h2>
          {item.sessions.length ? (
            <SessionList
              rows={item.sessions}
              hidePhotos
              action={(row) => (
                <BookControl
                  publicId={row.publicId}
                  remaining={row.remaining}
                  signedIn={signedIn}
                  isFamily={isFamily}
                  booked={bookedIds.has(row.publicId)}
                    coins={coins}
                />
              )}
            />
          ) : (
            <div className="xl-stack">
              <p className="xl-body">No dates are scheduled yet. Tell us you&rsquo;re interested and we&rsquo;ll let you know.</p>
              <div className="xl-row">
                <Button href="/contact">Ask about this class</Button>
              </div>
            </div>
          )}
        </div>
        <Notice icon={Users}>Older siblings are welcome to join too. Please share their ages when booking.</Notice>
      </section>
    </article>
  );
}
