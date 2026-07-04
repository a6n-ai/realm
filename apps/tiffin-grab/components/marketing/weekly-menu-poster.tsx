import { buildPosterColumns, dietDotClass, type PosterItem } from "@/lib/menu/poster";
import type { MealSlot } from "@/lib/menu/meal-types";

function weekRangeLabel(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-CA", { day: "numeric", month: "short" });
  return `${fmt(start)} – ${fmt(end)}`;
}

export function WeeklyMenuPoster({
  titlePrefix, weekStart, slots, items, accent,
}: { titlePrefix: string; weekStart: string; slots: MealSlot[]; items: PosterItem[]; accent: string }) {
  const columns = buildPosterColumns(slots, items);
  return (
    <div className="rounded-2xl border bg-card p-6 sm:p-8">
      <h2 className="text-2xl font-semibold tracking-tight" style={{ color: accent }}>
        {titlePrefix} — {weekRangeLabel(weekStart)}
      </h2>
      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {columns.map((col) => (
          <div key={col.label} className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: accent }}>{col.label}</h3>
            {col.groups.map((g, gi) => (
              <div key={g.slotLabel ?? gi} className="space-y-1">
                {g.slotLabel ? <p className="text-xs font-medium text-muted-foreground">{g.slotLabel}</p> : null}
                <ul className="space-y-1">
                  {g.dishes.length === 0 ? (
                    <li className="text-sm text-muted-foreground">—</li>
                  ) : g.dishes.map((d, i) => (
                    <li key={`${d.name}-${i}`} className="flex items-center gap-2 text-sm">
                      <span aria-hidden className={`size-2 rounded-full ${dietDotClass(d.diet, d.name)}`} />
                      <span>{d.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
