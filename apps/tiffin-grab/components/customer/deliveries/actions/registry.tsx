import type { ComponentType } from "react";
import { AddressSheet } from "./address-sheet";
import type { TripAction } from "@/lib/deliveries-view";
import { MoveSheet } from "./move-sheet";
import { PickSheet } from "./pick-sheet";
import { SwapSheet } from "./swap-sheet";
import type { ActionSheetProps } from "./types";

export type { ActionSheetProps } from "./types";

/** One sheet per TripAction. */
export const ACTION_SHEETS: Record<TripAction, ComponentType<ActionSheetProps>> = {
  pick: PickSheet,
  swap: SwapSheet,
  move: MoveSheet,
  address: AddressSheet,
};

export function ActionSheet({ action, ...props }: ActionSheetProps & { action: TripAction | null }) {
  if (!action) return null;
  const Sheet = ACTION_SHEETS[action];
  return <Sheet {...props} />;
}
