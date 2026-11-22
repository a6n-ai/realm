import { resolveCatalogDiscounts } from "@foundry/discounts";
import type { CatalogSnapshot, DealOption, DealTable } from "@/lib/catalog/types";
import { APP_DEFAULTS } from "@/db/schema/app-defaults";
import { applicableRules, hasEatingTiers } from "./discounts";

export function buildDealTable(snapshot: Pick<CatalogSnapshot, "frequencies" | "durations" | "discounts" | "maxDiscountPct">): DealTable {
  const rules = (snapshot.discounts ?? []).map((d) => ({ key: d.key, kind: d.kind, percent: d.percent, targetKey: d.targetPublicId, minWeeks: d.minWeeks, minEatingDays: d.minEatingDays }));
  const names = new Map((snapshot.discounts ?? []).map((d) => [d.key, d.name]));
  const maxDiscountPct = snapshot.maxDiscountPct ?? APP_DEFAULTS.maxDiscountPct;
  const weeks = snapshot.durations.map((d) => d.weeks).sort((a, b) => a - b);

  const optionsAt = (f: (typeof snapshot.frequencies)[number], eatingDays: number) => {
    const opts: Record<number, DealOption> = {};
    for (const d of snapshot.durations) {
      const applicable = applicableRules(rules, { targets: { delivery: f.publicId, duration: d.publicId }, weeks: d.weeks, eatingDays });
      const pct = resolveCatalogDiscounts(applicable.map((r) => ({ key: r.key, name: "", kind: "", percent: r.percent })), { subtotal: 100, maxDiscountPct }).totalPercent;
      opts[d.weeks] = { pct, includes: applicable.map((r) => ({ name: names.get(r.key) ?? r.key, percent: r.percent })) };
    }
    return opts;
  };
  const savingsOf = (opts: Record<number, DealOption>) => {
    const base = weeks.length ? opts[weeks[0]!]!.pct : 0;
    const saved: Record<number, number> = {};
    for (const w of weeks.slice(1)) {
      const save = Math.round((1 - (100 - opts[w]!.pct) / (100 - base)) * 100);
      if (save >= 1) saved[w] = save;
    }
    return saved;
  };

  const options: DealTable["options"] = {};
  const durationSavings: DealTable["durationSavings"] = {};
  const byDays: NonNullable<DealTable["byDays"]> = {};
  for (const f of snapshot.frequencies) {
    options[f.key] = optionsAt(f, 7);
    durationSavings[f.key] = savingsOf(options[f.key]!);
    if (!hasEatingTiers(snapshot.discounts, f.publicId)) continue;
    byDays[f.key] = {};
    for (let n = 1; n <= 7; n++) {
      const opts = optionsAt(f, n);
      byDays[f.key]![n] = { options: opts, durationSavings: savingsOf(opts) };
    }
  }
  return { options, durationSavings, ...(Object.keys(byDays).length ? { byDays } : {}) };
}
