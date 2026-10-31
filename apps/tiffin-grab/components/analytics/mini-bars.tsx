import { TONE_COLOR, type Tone } from "./chart-math";

const color = (tone: Tone) => (tone === "chart" ? "var(--chart-1)" : TONE_COLOR[tone]);

/** Small bars, the last one emphasised. */
export function MiniBars({ values, tone = "c1", height = 24 }: { values: number[]; tone?: Tone; height?: number }) {
  const max = Math.max(...values, 1);
  return (
    <div aria-hidden className="flex items-end gap-0.5" style={{ height }}>
      {values.map((v, i) => (
        <span
          key={i}
          className="w-1.5 rounded-sm"
          style={{ height: `${Math.max(8, (v / max) * 100)}%`, background: color(tone), opacity: i === values.length - 1 ? 1 : 0.4 }}
        />
      ))}
    </div>
  );
}
