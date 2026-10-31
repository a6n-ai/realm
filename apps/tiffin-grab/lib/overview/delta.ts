export type Delta = { text: string; tone: "ok" | "bad" | "flat"; word: string };

/** Change vs a baseline. `pct` reports percentage points (rates), else a relative percent. */
export function delta(now: number, before: number, opts: { good?: "up" | "down"; points?: boolean } = {}): Delta {
  const good = opts.good ?? "up";
  const diff = now - before;
  if (diff === 0 || (before === 0 && !opts.points && now === 0)) return { text: "0%", tone: "flat", word: "Flat" };
  const text = opts.points
    ? `${diff > 0 ? "+" : "−"}${Math.abs(Math.round(diff * 10) / 10)} pts`
    : before === 0
      ? `+${now}`
      : `${diff > 0 ? "+" : "−"}${Math.abs(Math.round((diff / before) * 100))}%`;
  const better = (diff > 0) === (good === "up");
  return { text, tone: better ? "ok" : "bad", word: better ? "Above" : "Below" };
}
