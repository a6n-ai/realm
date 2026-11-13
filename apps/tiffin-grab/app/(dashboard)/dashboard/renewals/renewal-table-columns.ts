// Plans-table column catalog and browser prefs for the Renewals desk Columns picker.
// Separate from Export's catalog — keys/labels can diverge (outcome vs track Status, etc.).
import { localStore } from "@foundry/ui/safe-storage";
import type { Column } from "@/components/ds";

export const PLAN_TABLE_STORAGE_KEY = "tg.renewals.plans.columns.v1";

export const PLAN_TABLE_COLUMNS = [
  { key: "customer", label: "Customer", defaultOn: true, required: true, width: "w-40" },
  { key: "phone", label: "Phone", defaultOn: false, width: "w-32" },
  { key: "mealSize", label: "Meal size", defaultOn: true, width: "w-28" },
  { key: "planName", label: "Plan", defaultOn: false, width: "w-28" },
  { key: "type", label: "Type", defaultOn: false, width: "w-24" },
  { key: "last", label: "Last tiffin", defaultOn: true, width: "w-36" },
  { key: "outcome", label: "Status", defaultOn: true, width: "w-32" },
  { key: "track", label: "Track", defaultOn: false, width: "w-36" },
  { key: "lostReason", label: "Lost reason", defaultOn: false, width: "w-28" },
  { key: "laterBookedAt", label: "Renewed date", defaultOn: false, width: "w-32" },
  { key: "nextFollowUp", label: "Follow-up", defaultOn: false, width: "w-28" },
  { key: "lastActivity", label: "Notes", defaultOn: false, width: "w-40" },
  { key: "priorPlans", label: "Prior renewals", defaultOn: false, align: "right" as const, width: "w-24" },
  { key: "holds", label: "Hold days", defaultOn: false, align: "right" as const, width: "w-24" },
  { key: "openTickets", label: "Open tickets", defaultOn: false, align: "right" as const, width: "w-24" },
  { key: "coins", label: "Wallet", defaultOn: true, align: "right" as const, width: "w-20" },
  { key: "spent", label: "Total spent", defaultOn: true, align: "right" as const, width: "w-24" },
  { key: "total", label: "Last spent", defaultOn: true, align: "right" as const, width: "w-24" },
  { key: "prevPlanTotal", label: "Previous plan", defaultOn: false, align: "right" as const, width: "w-28" },
  { key: "actions", label: "Actions", defaultOn: true, required: true, align: "right" as const, width: "w-20" },
] as const;

export type PlanTableColumnKey = (typeof PLAN_TABLE_COLUMNS)[number]["key"];

const KEYS = new Set<string>(PLAN_TABLE_COLUMNS.map((c) => c.key));
const REQUIRED = PLAN_TABLE_COLUMNS.filter((c) => "required" in c && c.required).map((c) => c.key);

export const DEFAULT_PLAN_TABLE_COLUMNS: PlanTableColumnKey[] = PLAN_TABLE_COLUMNS.filter((c) => c.defaultOn).map((c) => c.key);

type Stored = { v: 1; on: string[] };

/** Catalog order, required columns forced on, unknown keys dropped. Empty/unknown-only → defaults. */
export function normalizePlanTableColumns(raw: readonly string[] | null | undefined): PlanTableColumnKey[] {
  if (raw == null || raw.length === 0) return [...DEFAULT_PLAN_TABLE_COLUMNS];
  const picked = raw.filter((k): k is PlanTableColumnKey => KEYS.has(k));
  if (picked.length === 0) return [...DEFAULT_PLAN_TABLE_COLUMNS];
  const on = new Set<PlanTableColumnKey>([...REQUIRED, ...picked]);
  return PLAN_TABLE_COLUMNS.map((c) => c.key).filter((k) => on.has(k));
}

export function loadPlanTableColumns(): PlanTableColumnKey[] {
  const stored = localStore.getJson<Stored | null>(PLAN_TABLE_STORAGE_KEY, null);
  if (!stored || stored.v !== 1 || !Array.isArray(stored.on)) return [...DEFAULT_PLAN_TABLE_COLUMNS];
  return normalizePlanTableColumns(stored.on);
}

export function savePlanTableColumns(on: readonly PlanTableColumnKey[]) {
  const ordered = normalizePlanTableColumns(on);
  localStore.setJson(PLAN_TABLE_STORAGE_KEY, { v: 1, on: ordered } satisfies Stored);
  return ordered;
}

export function planTableColumnDefs(keys: readonly PlanTableColumnKey[]): Column<PlanTableColumnKey>[] {
  return keys.flatMap((key) => {
    const def = PLAN_TABLE_COLUMNS.find((c) => c.key === key);
    if (!def) return [];
    return [{ key: def.key, label: def.label, align: "align" in def ? def.align : undefined, width: def.width }];
  });
}

/** Fact chips under Customer hide when that fact is already a visible column. */
export const FACT_COLUMN: Record<"priorPlans" | "holds" | "openTickets", PlanTableColumnKey> = {
  priorPlans: "priorPlans",
  holds: "holds",
  openTickets: "openTickets",
};
