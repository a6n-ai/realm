import { slotTone, type Tone } from "@/components/analytics/chart-math";

export type SourceOutcomes = { key: string; source: string; total: number; converted: number; lost: number };

export type FlowNode = { name: string; tone: Tone };
export type FlowLink = { source: number; target: number; value: number };

export const OUTCOMES = [
  { name: "Converted", tone: "success" as const },
  { name: "Lost", tone: "destructive" as const },
  { name: "Still open", tone: "muted" as const },
];

/** Top 5 sources by volume (rows arrive sorted) keep a slot colour; the rest fold into a muted "Other". Outcomes without leads are dropped. */
export function buildSourceFlow(rows: SourceOutcomes[], max = 5): { nodes: FlowNode[]; links: FlowLink[] } {
  const live = rows.filter((r) => r.total > 0);
  const head = live.slice(0, max);
  const rest = live.slice(max);
  const order = head.map((r) => r.key);
  const sources = head.map((r) => ({ name: r.source, tone: slotTone(r.key, order), ...r }));
  if (rest.length) {
    const sum = (k: "total" | "converted" | "lost") => rest.reduce((s, r) => s + r[k], 0);
    sources.push({ name: "Other", tone: "muted", key: "other", source: "Other", total: sum("total"), converted: sum("converted"), lost: sum("lost") });
  }
  const outcomeOf = (s: (typeof sources)[number]) => [s.converted, s.lost, s.total - s.converted - s.lost];
  const used = OUTCOMES.map((_, i) => sources.some((s) => outcomeOf(s)[i]! > 0));
  const outcomeIndex = new Map<number, number>();
  const outcomeNodes: FlowNode[] = [];
  OUTCOMES.forEach((o, i) => {
    if (!used[i]) return;
    outcomeIndex.set(i, sources.length + outcomeNodes.length);
    outcomeNodes.push({ name: o.name, tone: o.tone });
  });
  const links: FlowLink[] = [];
  sources.forEach((s, si) =>
    outcomeOf(s).forEach((value, oi) => {
      if (value > 0) links.push({ source: si, target: outcomeIndex.get(oi)!, value });
    }),
  );
  return { nodes: [...sources.map((s) => ({ name: s.name, tone: s.tone })), ...outcomeNodes], links };
}
