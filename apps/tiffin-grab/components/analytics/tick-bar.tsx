import { TONE_COLOR, type Tone } from "./chart-math";

const color = (tone: Tone) => (tone === "chart" ? "var(--chart-1)" : TONE_COLOR[tone]);

/** `ticks` slim bars, the first `filled` in `tone`. */
export function TickBar({ filled, ticks = 50, tone = "success" }: { filled: number; ticks?: number; tone?: Tone }) {
  return (
    <div aria-hidden className="flex h-6 w-full gap-px">
      {Array.from({ length: ticks }, (_, i) => (
        <span key={i} className="flex-1 rounded-sm" style={{ background: i < filled ? color(tone) : "var(--muted)" }} />
      ))}
    </div>
  );
}
