"use client";

import { useState } from "react";
import Link from "next/link";
import { PROGRAMMES, WEEK, WEEK_DAYS, type ProgrammeKey, type WeekCell } from "@/lib/marketing/content";

function cellKey(cell: WeekCell): ProgrammeKey | undefined {
  return "programme" in cell ? cell.programme : cell.key;
}

export function WeekCalendar() {
  const [highlight, setHighlight] = useState<ProgrammeKey | null>(null);

  return (
    <>
      <div className="xl-legend" role="group" aria-label="Highlight a programme" style={{ marginTop: 22 }}>
        {PROGRAMMES.map((p) => (
          <button
            key={p.key}
            type="button"
            className="xl-chip"
            data-programme={p.key}
            aria-pressed={highlight === p.key}
            onClick={() => setHighlight(highlight === p.key ? null : p.key)}
          >
            {p.title}
          </button>
        ))}
      </div>
      <div className="xl-cal" style={{ marginTop: 20 }} role="region" tabIndex={0} aria-label="Weekly timetable">
        <table>
          <thead>
            <tr>
              <th scope="col">Time</th>
              {WEEK_DAYS.map((d) => (
                <th key={d} scope="col">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEK.map((row) => (
              <tr key={row.slot}>
                <th scope="row">{row.slot}</th>
                {row.cells.map((cell, i) => {
                  const dimmed = highlight !== null && cellKey(cell) !== highlight;
                  return (
                    <td key={i} data-dimmed={dimmed ? "" : undefined}>
                      {"programme" in cell ? (
                        <div className="xl-slot" data-programme={cell.programme}>
                          <span>{cell.time}</span>
                          <b>{cell.title}</b>
                          <Link href="/whats-on" tabIndex={dimmed ? -1 : undefined}>
                            Book / enquire ↗
                          </Link>
                        </div>
                      ) : (
                        <div className="xl-slot-note">{cell.note}</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="xl-hint">Swipe the timetable sideways to see the whole week.</p>
    </>
  );
}
