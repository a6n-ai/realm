import type { CSSProperties } from "react";
import { loadPublicSessionCards } from "@/lib/sessions/public";
import { Button, SectionHeading } from "@/components/marketing/ui";
import { SessionList } from "@/components/marketing/session-list";

export async function HomeSessions() {
  const { groups } = await loadPublicSessionCards();
  const upcoming = groups.slice(0, 2);

  return (
    <section id="availability" className="xl-wrap xl-section" style={{ "--pt": "48px" } as CSSProperties}>
      <div className="xl-panel xl-stack">
        <SectionHeading
          eyebrow="Open for booking"
          title="Seats this week."
          size="md"
          lede="Published sessions with spots left. Book a seat for each child, or ask us about a private session."
        />
        {upcoming.length === 0 ? (
          <p className="xl-body">
            New sessions are on their way. Private sessions run Monday to Saturday by arrangement, so just ask.
          </p>
        ) : (
          upcoming.map((group) => (
            <div key={group.key}>
              <h3 className="xl-day-label">{group.tape}</h3>
              <SessionList
                rows={group.rows}
                action={(row) => (
                  <Button size="xs" variant="secondary" href={`/whats-on?book=${row.publicId}#session-${row.publicId}`}>
                    {row.remaining > 0 ? "Book" : "Details"}
                  </Button>
                )}
              />
            </div>
          ))
        )}
        <div className="xl-row">
          <Button href="/whats-on" icon="arrow-right">
            See the full calendar
          </Button>
          <Button href="/contact" variant="secondary">
            Ask about a private session
          </Button>
        </div>
      </div>
    </section>
  );
}
