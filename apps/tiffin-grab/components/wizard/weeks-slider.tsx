import { cn } from "@/components/customer/kit/cn";

// Bigger savings read bigger: 12px with nothing off, about 20px at the best deal.
const saveSize = (save: number, best: number) => (best > 0 ? 12 + Math.round((save / best) * 8) : 12);

/**
 * Commitment length as one timeline: a native range slider over the offered durations (finger drag,
 * keyboard and screen readers for free), each stop labelled with its weeks and the discount it earns.
 */
export function WeeksSlider({ weeks, value, savings, perWeek, onChange }: { weeks: number[]; value: number; savings: Record<number, number>; /** Tiffins a week, to say how many arrive in all. */ perWeek?: number; onChange: (weeks: number) => void }) {
  const stops = [...weeks].sort((a, b) => a - b);
  const at = Math.max(0, stops.indexOf(value));
  const last = Math.max(stops.length - 1, 1);
  const best = Math.max(0, ...stops.map((w) => savings[w] ?? 0));
  const save = savings[value] ?? 0;
  // The nearest longer plan that saves more, so the line can say what one step further is worth.
  const better = stops.slice(at + 1).find((w) => (savings[w] ?? 0) > save);
  const pos = (i: number) => `${(i / last) * 100}%`;
  const tiffins = perWeek ? value * perWeek : null;
  return (
    <div className="space-y-2">
      {/* Discounts ride above their stop, sized by how much they save. */}
      <div aria-hidden className="relative mx-3.5 h-6">
        {stops.map((w, i) => {
          const s = savings[w] ?? 0;
          return s > 0 ? (
            <span
              key={w}
              className={cn("absolute bottom-0 -translate-x-1/2 font-bold leading-none tabular-nums whitespace-nowrap text-[var(--s-delivered,#10b981)] transition-[font-size] duration-200", i === at ? "opacity-100" : "opacity-70")}
              style={{ left: pos(i), fontSize: saveSize(s, best) }}
            >
              −{s}%
            </span>
          ) : null;
        })}
      </div>
      <input
        type="range"
        aria-label="Commitment length"
        aria-valuetext={`${value} ${value === 1 ? "week" : "weeks"}${tiffins ? `, ${tiffins} tiffins` : ""}${save > 0 ? `, save ${save}%` : ""}`}
        min={0}
        max={stops.length - 1}
        step={1}
        value={at}
        onChange={(e) => onChange(stops[Number(e.target.value)]!)}
        className="c-range w-full"
        style={{ ["--fill" as string]: pos(at) }}
      />
      <div aria-hidden className="relative mx-3.5 h-4">
        {stops.map((w, i) => (
          <span key={w} className={cn("absolute top-0 -translate-x-1/2 text-xs font-semibold tabular-nums", i === at ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)]")} style={{ left: pos(i) }}>
            {w}
          </span>
        ))}
      </div>
      <p className="flex flex-wrap items-baseline gap-x-2 pt-1" aria-live="polite">
        <span className="text-[22px] leading-none font-bold tracking-[-0.03em]">{value} {value === 1 ? "week" : "weeks"}</span>
        {tiffins != null && <span className="text-[15px] font-semibold text-[var(--muted-foreground)] tabular-nums">· {tiffins} {tiffins === 1 ? "tiffin" : "tiffins"}</span>}
        {save > 0 && (
          <span className="font-bold leading-none text-[var(--s-delivered,#10b981)] transition-[font-size] duration-200" style={{ fontSize: Math.max(15, saveSize(save, best) + 2) }}>
            Save {save}%
          </span>
        )}
        {better && <span className="text-[13px] text-[var(--muted-foreground)]">{better} weeks saves {savings[better]}%</span>}
      </p>
    </div>
  );
}
