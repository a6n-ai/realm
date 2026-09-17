import { SITE_NAME } from "@/lib/brand";
import { Role } from "@foundry/commons";
import { buildMetadata } from "@/lib/seo";
import { BookControl } from "@/components/marketing/book-control";
import { getSession } from "@/lib/auth/session";
import { bookingsService } from "@/lib/services/bookings.service";
import { loadPublicSessionCards } from "@/lib/sessions/public";
import type { BoardTone } from "@/lib/sessions/format";

export const metadata = buildMetadata({
  title: `What's On · ${SITE_NAME}`,
  description: "Ages 5 to 75 on one board. Pick a bench.",
  path: "/whats-on",
});

const TONE: Record<BoardTone, string> = {
  muted: "text-[var(--graphite)]",
  action: "text-[var(--blueprint)]",
  ink: "text-[var(--ink)]",
};

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

  return (
    <article>
      <header className="xpl-blush-band border-b border-[var(--rule)] px-5 py-14 lg:px-20 lg:py-24">
        <p className="xpl-mono text-[11px] lg:text-xs">Calendar</p>
        <h1 className="xpl-disp mt-5 max-w-[16ch] text-[52px] leading-[0.9] tracking-[-0.04em] lg:text-[112px]">
          What&apos;s on the benches.
        </h1>
        <p className="mt-6 max-w-[36ch] text-[17px] leading-[1.5] lg:text-xl lg:leading-[1.55]">
          Ages 5 to 75 on one board. Pick a bench. Each class is one day — book the day you want. Prices are on the
          session. Drop-off, stay, or come after work.
        </p>
      </header>
      <section className="flex flex-col gap-12 px-5 py-14 lg:px-20 lg:py-24">
        {groups.length === 0 ? (
          <p className="m-0 max-w-[40ch] text-[17px] leading-[1.5] lg:text-xl">
            No published sessions yet. When a class is on the board, you can book a seat from here.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.key} className="flex flex-col gap-1">
              <h2 className="xpl-mono m-0 text-[11px] tracking-[0.12em] uppercase">{group.tape}</h2>
              <div className="xpl-board-paper mt-3 px-4 py-2 lg:px-9 lg:py-4">
                {group.rows.map((row) => {
                  const focused = focusId === row.publicId;
                  return (
                    <div
                      key={row.occurrenceKey}
                      id={`session-${row.publicId}`}
                      className={`flex flex-col gap-3 border-b border-[var(--rule)] py-5 last:border-b-0 lg:grid lg:grid-cols-[110px_1fr_auto] lg:items-center lg:gap-6 lg:py-[18px] ${focused ? "ring-2 ring-[var(--tape)] ring-offset-4" : ""}`}
                    >
                      <div className="flex justify-between font-[family-name:var(--font-mono)] text-[10px] tracking-[0.12em] uppercase lg:contents">
                        <span className="lg:text-[13px] lg:tracking-[0.1em]">{row.time}</span>
                        <span className={`lg:hidden ${TONE[row.tone]}`}>{row.spots}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <h3 className="xpl-disp m-0 text-[22px] leading-none tracking-[-0.02em] lg:text-2xl">{row.title}</h3>
                        <p className="xpl-mono m-0 text-[10px] tracking-[0.08em] lg:text-[11px] lg:tracking-[0.1em]">{row.spec}</p>
                        <p className={`xpl-mono m-0 hidden text-[11px] lg:block ${TONE[row.tone]}`}>{row.spots}</p>
                      </div>
                      <BookControl
                        publicId={row.publicId}
                        remaining={row.remaining}
                        signedIn={signedIn}
                        isFamily={isFamily}
                        booked={bookedIds.has(row.publicId)}
                        autofocus={focused}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </section>
    </article>
  );
}
