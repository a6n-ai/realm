import { addDays } from "@/lib/deliveries-view/week";
import type { MissedDeliveryRow, MissedKind } from "@/lib/services/missed-deliveries.service";

// Kept out of missed-list.tsx ("use client") so the server page can build the Why facet from it.
export const MISSED_WHY: Record<MissedKind, string> = {
  not_sent: "Never sent to OptimoRoute",
  no_confirmation: "Sent, no confirmation",
};

export const MISSED_DAYS = [
  { value: "1", label: "Yesterday" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
] as const;

export type MissedFilter = { q?: string; why?: string; day?: string };

/**
 * The Missed deliveries tab loads every missed row (it's a short list), so its filters run here.
 * `day` counts back from today; it is its own param because the page date range defaults to
 * this month, and a missed day from last month is still owed.
 */
export function filterMissedRows(rows: MissedDeliveryRow[], f: MissedFilter, today: string): MissedDeliveryRow[] {
  const q = f.q?.trim().toLowerCase();
  const back = MISSED_DAYS.some((d) => d.value === f.day) ? Number(f.day) : null;
  const since = back != null ? addDays(today, -back) : null;
  return rows.filter((r) =>
    (!f.why || r.kind === f.why)
    && (!since || r.deliveryDate >= since)
    && (!q || [r.customerName, r.orderCode, r.planName].some((s) => s?.toLowerCase().includes(q))),
  );
}
