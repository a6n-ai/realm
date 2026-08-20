import Link from "next/link";
import { parseIsoDateUtc } from "@realm/commons";
import { Button } from "@realm/ui/button";
import { buildPosterColumns, DAYS, DAY_COLUMNS, type PosterItem } from "@/lib/menu/poster";
import type { MealSlot } from "@/lib/menu/meal-types";
import { formatDateOnly } from "@/lib/format/datetime";

function weekRangeLabel(weekStart: string): string {
  const end = parseIsoDateUtc(weekStart);
  end.setUTCDate(end.getUTCDate() + 6);
  const endIso = end.toISOString().slice(0, 10);
  return `${formatDateOnly(weekStart, { mode: "short" })} – ${formatDateOnly(endIso, { mode: "short" })}`;
}

// Ticket header date: offset the column's first real weekday from weekStart (Monday).
function columnDateLabel(weekStart: string, days: readonly string[]): string {
  const offset = DAYS.indexOf(days[0] as (typeof DAYS)[number]);
  const d = parseIsoDateUtc(weekStart);
  d.setUTCDate(d.getUTCDate() + offset);
  return formatDateOnly(d.toISOString().slice(0, 10), { mode: "short" });
}

export function WeeklyMenuPoster({
  titlePrefix, weekStart, slots, items, accent,
}: { titlePrefix: string; weekStart: string; slots: MealSlot[]; items: PosterItem[]; accent: string }) {
  const columns = buildPosterColumns(slots, items);
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="m-0 text-2xl font-bold tracking-tight" style={{ color: accent }}>
          {titlePrefix}
        </h2>
        <span className="text-sm font-semibold text-muted-foreground">{weekRangeLabel(weekStart)} · scroll →</span>
      </div>
      <div className="mt-4 flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {columns.map((col, ci) => {
          const dishes = col.groups.flatMap((g) => g.dishes);
          const primary = dishes[0]?.name;
          return (
            <div key={col.label} className="w-[250px] shrink-0 overflow-hidden rounded-2xl border-[1.5px] border-foreground bg-card">
              <div className="flex items-center justify-between border-b-[1.5px] border-dashed border-foreground px-4 py-3">
                <span className="text-lg font-bold tracking-wide">{col.label}</span>
                <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                  {columnDateLabel(weekStart, DAY_COLUMNS[ci]?.days ?? [])}
                </span>
              </div>
              <div
                className="flex h-[110px] items-center justify-center"
                style={{ background: "repeating-linear-gradient(-45deg, var(--muted) 0 10px, color-mix(in srgb, var(--muted) 80%, var(--foreground)) 10px 20px)" }}
              >
                <span className="font-mono text-xs text-muted-foreground">
                  {primary ? `photo: ${primary.toLowerCase()}` : "photo: —"}
                </span>
              </div>
              <div className="p-4">
                {dishes.length > 0 ? (
                  col.groups.map((g, gi) => (
                    <div key={g.slotLabel ?? gi} className={gi > 0 ? "mt-2" : undefined}>
                      {g.slotLabel ? <p className="mb-1 text-xs font-medium text-muted-foreground">{g.slotLabel}</p> : null}
                      <ul className="space-y-1">
                        {g.dishes.map((d, i) => (
                          <li key={`${d.name}-${i}`} className="flex items-start gap-1.5 text-sm leading-snug">
                            <span className="text-primary">✦</span>
                            <span>{d.name}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))
                ) : (
                  <p className="m-0 text-[12.5px] text-muted-foreground italic">Kitchen&apos;s day off.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <Button asChild size="lg" className="mt-6 rounded-full"><Link href="/subscribe">Build my tiffin →</Link></Button>
    </div>
  );
}
