export type Strategy = "creator" | "round_robin" | "percentage";
export interface LeadAssignmentConfig { strategy: Strategy; perSource: Record<string, Strategy>; weights: Record<string, number>; cursor: Record<string, string> }
export interface PoolMember { id: bigint; publicId: string }
export interface PickResult { chosen: PoolMember | null; cursorPublicId: string | null }

export function strategyFor(cfg: LeadAssignmentConfig, sourceKey: string): Strategy {
  return cfg.perSource[sourceKey] ?? cfg.strategy;
}

export function pickAssignee(strategy: Strategy, pool: PoolMember[], cfg: LeadAssignmentConfig, sourceKey: string, roll: number): PickResult {
  if (pool.length === 0) return { chosen: null, cursorPublicId: null };
  const sorted = [...pool].sort((a, b) => a.publicId.localeCompare(b.publicId));

  if (strategy === "percentage") {
    const weights = sorted.map((m) => Math.max(0, cfg.weights[m.publicId] ?? 1));
    const total = weights.reduce((s, w) => s + w, 0) || sorted.length;
    let acc = 0;
    const target = Math.min(0.999999, Math.max(0, roll)) * total;
    for (let i = 0; i < sorted.length; i++) {
      acc += weights[i] || 1;
      if (target < acc) return { chosen: sorted[i], cursorPublicId: sorted[i].publicId };
    }
    return { chosen: sorted[sorted.length - 1], cursorPublicId: sorted[sorted.length - 1].publicId };
  }

  // round_robin (and any non-creator default): advance past the stored cursor
  const last = cfg.cursor[sourceKey];
  const lastIdx = last ? sorted.findIndex((m) => m.publicId === last) : -1;
  const next = sorted[(lastIdx + 1) % sorted.length];
  return { chosen: next, cursorPublicId: next.publicId };
}
