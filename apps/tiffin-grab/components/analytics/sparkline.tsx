import { TONE_COLOR, type Tone } from "./chart-math";

const color = (tone: Tone) => (tone === "chart" ? "var(--chart-1)" : TONE_COLOR[tone]);

/** 14-point line; decorative, the value is always printed beside it. */
export function Sparkline({ values, tone = "c1", width = 96, height = 32 }: { values: number[]; tone?: Tone; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const pad = 2;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * width},${height - pad - ((v - min) / span) * (height - pad * 2)}`);
  return (
    <svg aria-hidden width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0 overflow-visible">
      <polyline points={pts.join(" ")} fill="none" stroke={color(tone)} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
