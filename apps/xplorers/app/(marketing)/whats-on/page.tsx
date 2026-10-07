import type { CSSProperties } from "react";
import { SITE_NAME } from "@/lib/brand";
import { Role } from "@foundry/commons";
import { buildMetadata } from "@/lib/seo";
import { BookControl } from "@/components/marketing/book-control";
import { SessionList } from "@/components/marketing/session-list";
import { Eyebrow, Notice, stagger } from "@/components/marketing/ui";
import { getSession } from "@/lib/auth/session";
import { bookingsService } from "@/lib/services/bookings.service";
import { walletService } from "@/lib/services/wallet.service";
import { loadPublicSessionCards } from "@/lib/sessions/public";
import { Users } from "lucide-react";

export const metadata = buildMetadata({
  title: `What's On · ${SITE_NAME}`,
  description: "Every published session at Xplorers.Life. Book a seat for each child.",
  path: "/whats-on",
});

export default async function WhatsOnPage({
  searchParams,
}: {
  searchParams: Promise<{ book?: string }>;
}) {
  const [{ groups }, session, params] = await Promise.all([loadPublicSessionCards(), getSession(), searchParams]);
  const signedIn = Boolean(session?.user);
  const isFamily = session?.user?.role === Role.USER;
  const focusId = params.book;
  const bookedIds = new Set(
    isFamily && session?.user ? await bookingsService.listConfirmedOccurrencePublicIds(session.user.id) : [],
  );
  const coins = isFamily && session?.user ? await walletService.coinsForFamily(session.user.id) : null;

  return (
    <article>
      <header className="xl-page-hero">
        <div className="xl-wrap">
          <Eyebrow dot style={stagger(0)}>
            What&rsquo;s on
          </Eyebrow>
          <h1 className="xl-display" style={stagger(1)}>
            Find your next session.
          </h1>
          <p className="xl-lede" style={stagger(2)}>
            Every published session, day by day. Book a seat for each child; prices are on the session. Spots update as
            people book.
          </p>
        </div>
      </header>
      <section className="xl-wrap xl-section xl-stack" style={{ "--gap": "28px" } as CSSProperties}>
        {groups.length === 0 ? (
          <div className="xl-panel">
            <p className="xl-body">
              No sessions are published yet. Private sessions run Monday to Saturday by arrangement, so drop us a line.
            </p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.key} className="xl-panel">
              <h2 className="xl-day-label">{group.tape}</h2>
              <SessionList
                rows={group.rows}
                focusId={focusId}
                showDescription
                action={(row) => (
                  <BookControl
                    publicId={row.publicId}
                    remaining={row.remaining}
                    signedIn={signedIn}
                    isFamily={isFamily}
                    booked={bookedIds.has(row.publicId)}
                    coins={coins}
                    autofocus={focusId === row.publicId}
                  />
                )}
              />
            </div>
          ))
        )}
        <Notice icon={Users}>Older siblings are welcome to join too. Please share their ages when booking.</Notice>
      </section>
    </article>
  );
}
