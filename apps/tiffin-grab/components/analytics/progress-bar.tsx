import { TONE_COLOR, type Tone } from "./chart-math";

const color = (tone: Tone) => (tone === "chart" ? "var(--chart-1)" : TONE_COLOR[tone]);

/** Thin progress track, `pct` 0-100. */
export function ProgressBar({ pct, tone = "c1" }: { pct: number; tone?: Tone }) {
  return (
    <div aria-hidden className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color(tone) }} />
    </div>
  );
}
