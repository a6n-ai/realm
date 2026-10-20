import type { CSSProperties } from "react";
import { Users } from "lucide-react";
import { SITE_NAME } from "@/lib/brand";
import { buildMetadata } from "@/lib/seo";
import { PublicCalendar } from "@/components/marketing/public-calendar";
import { SessionList } from "@/components/marketing/session-list";
import { Button, Eyebrow, Notice, stagger } from "@/components/marketing/ui";
import { getSession } from "@/lib/auth/session";
import { bookHref, loadPublicSessionCards } from "@/lib/sessions/public";

export const metadata = buildMetadata({
  title: `What's On · ${SITE_NAME}`,
  description: "Every published session at Xplorers.Life. Book a seat for each child.",
  path: "/whats-on",
});

export default async function WhatsOnPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ groups }, session, sp] = await Promise.all([loadPublicSessionCards(), getSession(), searchParams]);
  const signedIn = Boolean(session?.user);

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
            Every published session, week by week. Pick one to book a seat for each child. Spots update as people book.
          </p>
        </div>
      </header>
      <section className="xl-wrap xl-section xl-stack" style={{ "--gap": "28px" } as CSSProperties}>
        <PublicCalendar searchParams={sp} />
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
                showDescription
                action={(row) => (
                  <Button size="xs" variant="secondary" href={bookHref(row.publicId, signedIn)}>
                    {row.remaining > 0 ? "Book" : "Details"}
                  </Button>
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
