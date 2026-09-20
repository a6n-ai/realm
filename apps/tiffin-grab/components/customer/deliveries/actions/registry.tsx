import type { ComponentType } from "react";
import type { TripAction } from "@/lib/deliveries-view";
import { HoldSheet } from "./hold-sheet";
import { MakeupSheet } from "./makeup-sheet";
import { MoveSheet } from "./move-sheet";
import { PickSheet } from "./pick-sheet";
import { PoolSheet } from "./pool-sheet";
import { SwapSheet } from "./swap-sheet";
import type { ActionSheetProps } from "./types";
import { VacationSheet } from "./vacation-sheet";

export type { ActionSheetProps } from "./types";

/** One sheet per TripAction. Each agent edits only its own file; "resume" reuses the hold sheet (it branches on trip.status). */
export const ACTION_SHEETS: Record<TripAction, ComponentType<ActionSheetProps>> = {
  pick: PickSheet,
  swap: SwapSheet,
  hold: HoldSheet,
  resume: HoldSheet,
  move: MoveSheet,
  vacation: VacationSheet,
  makeup: MakeupSheet,
  pool: PoolSheet,
};

export function ActionSheet({ action, ...props }: ActionSheetProps & { action: TripAction | null }) {
  if (!action) return null;
  const Sheet = ACTION_SHEETS[action];
  return <Sheet {...props} />;
}
