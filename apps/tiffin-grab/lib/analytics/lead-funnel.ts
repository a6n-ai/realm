/** Pipeline order; a lead at a later stage passed through every earlier one. */
export const LEAD_PIPELINE = ["new", "contacted", "quoted", "follow_up", "converted"] as const;
export type PipelineStage = (typeof LEAD_PIPELINE)[number];

/**
 * Leads that got at least this far, from current-stage counts. The first step is every lead, lost
 * ones included (we do not know where a lost lead dropped out, so it only counts as received).
 */
export function reachedStages(counts: Record<string, number>): { key: PipelineStage; reached: number }[] {
  const at = (k: string) => counts[k] ?? 0;
  const all = LEAD_PIPELINE.reduce((s, k) => s + at(k), 0) + at("lost");
  return LEAD_PIPELINE.map((key, i) => ({
    key,
    reached: i === 0 ? all : LEAD_PIPELINE.slice(i).reduce((s, k) => s + at(k), 0),
  }));
}
