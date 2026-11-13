import { formatTuHuman, type TuCategory } from "@/lib/menu/format-tu";

export type AdminTuCategory = TuCategory & { key: string; label: string };

/** Read-only 1 TU ↔ 1 TU natural exchange for admin Swap Rules (never persisted). */
export function naturalSwapConversion(
  from: AdminTuCategory | undefined,
  to: AdminTuCategory | undefined,
): { tuLine: string; naturalLine: string } | null {
  if (!from || !to || !Number.isFinite(from.tuUnitSize) || !Number.isFinite(to.tuUnitSize)) return null;
  return {
    tuLine: "1 TU ↔ 1 TU",
    naturalLine: `${formatTuHuman(from, 1)} → ${formatTuHuman(to, 1)}`,
  };
}
