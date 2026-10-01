import type { ReactNode } from "react";
import type { PublicSessionCard } from "@/lib/sessions/format";

/** One day's published sessions. `action` renders the right-hand control per row. */
export function SessionList({
  rows,
  action,
  focusId,
  showDescription,
}: {
  rows: PublicSessionCard[];
  action: (row: PublicSessionCard) => ReactNode;
  focusId?: string;
  showDescription?: boolean;
}) {
  return (
    <ul className="xl-sessions">
      {rows.map((row) => (
        <li
          key={row.occurrenceKey}
          id={`session-${row.publicId}`}
          className="xl-session"
          data-focused={focusId === row.publicId ? "" : undefined}
        >
          <span className="xl-session-time">{row.time}</span>
          <div>
            <h3 className="xl-session-title">{row.title}</h3>
            <p className="xl-session-spec">
              {row.spec} · <span className="xl-spots" data-tone={row.tone}>{row.spots}</span>
            </p>
            {showDescription && row.description ? <p className="xl-session-desc">{row.description}</p> : null}
            {row.photos.length > 0 ? (
              <ul className="xl-photos">
                {row.photos.slice(0, 4).map((url, i) => (
                  <li key={url}>
                    {/* Uploaded class photos, not the static marketing set. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={i === 0 ? row.title : ""} loading="lazy" />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {action(row)}
        </li>
      ))}
    </ul>
  );
}
