import { formatTuHuman, type TuCategory } from "@/lib/menu/format-tu";

export type AdminTuCategory = {
  key: string;
  label: string;
  tuUnitType: "weight" | "count";
  tuUnitSize: number;
  tuUnitLabel: string;
};

/** Read-only 1 TU ↔ 1 TU natural exchange for admin Swap Rules (never persisted). */
export function naturalSwapConversion(
  from: AdminTuCategory | undefined,
  to: AdminTuCategory | undefined,
): { tuLine: string; naturalLine: string } | null {
  if (!from || !to || !Number.isFinite(from.tuUnitSize) || !Number.isFinite(to.tuUnitSize)) return null;
  const fromTu: TuCategory = { tuUnitType: from.tuUnitType, tuUnitSize: from.tuUnitSize, tuUnitLabel: from.tuUnitLabel };
  const toTu: TuCategory = { tuUnitType: to.tuUnitType, tuUnitSize: to.tuUnitSize, tuUnitLabel: to.tuUnitLabel };
  return {
    tuLine: "1 TU ↔ 1 TU",
    naturalLine: `${formatTuHuman(fromTu, 1)} → ${formatTuHuman(toTu, 1)}`,
  };
}

/** Human label for meal_rules.condition — keep enum values out of the admin UI. */
export function mealRuleConditionLabel(condition: "exclusive_to_plan"): string {
  switch (condition) {
    case "exclusive_to_plan":
      return "Plan-exclusive dishes only";
    default: {
      const _exhaustive: never = condition;
      return _exhaustive;
    }
  }
}
