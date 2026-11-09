import { resolveCatalogDiscounts } from "@foundry/discounts";
import type { CatalogSnapshot, DealTable } from "@/lib/catalog/types";
import { APP_DEFAULTS } from "@/db/schema/app-defaults";
import { applicableRules } from "./discounts";

export function buildDealTable(snapshot: Pick<CatalogSnapshot, "frequencies" | "durations" | "discounts" | "maxDiscountPct">): DealTable {
  const rules = (snapshot.discounts ?? []).map((d) => ({ key: d.key, kind: d.kind, percent: d.percent, targetKey: d.targetPublicId, minWeeks: d.minWeeks }));
  const names = new Map((snapshot.discounts ?? []).map((d) => [d.key, d.name]));
  const maxDiscountPct = snapshot.maxDiscountPct ?? APP_DEFAULTS.maxDiscountPct;
  const weeks = snapshot.durations.map((d) => d.weeks).sort((a, b) => a - b);

  const options: DealTable["options"] = {};
  const durationSavings: DealTable["durationSavings"] = {};
  for (const f of snapshot.frequencies) {
    options[f.key] = {};
    for (const d of snapshot.durations) {
      const applicable = applicableRules(rules, { targets: { delivery: f.publicId, duration: d.publicId }, weeks: d.weeks });
      const pct = resolveCatalogDiscounts(applicable.map((r) => ({ key: r.key, name: "", kind: "", percent: r.percent })), { subtotal: 100, maxDiscountPct }).totalPercent;
      options[f.key]![d.weeks] = { pct, includes: applicable.map((r) => ({ name: names.get(r.key) ?? r.key, percent: r.percent })) };
    }
    const base = weeks.length ? options[f.key]![weeks[0]!]!.pct : 0;
    const saved: Record<number, number> = {};
    for (const w of weeks.slice(1)) {
      const save = Math.round((1 - (100 - options[f.key]![w]!.pct) / (100 - base)) * 100);
      if (save >= 1) saved[w] = save;
    }
    durationSavings[f.key] = saved;
  }
  return { options, durationSavings };
}
