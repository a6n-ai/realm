import type { Trip } from "@/lib/deliveries-view";
import type { PlanView } from "../adapter";

/** Contract every action sheet implements. Mounted only while its action is active; onDone closes it (call after a successful commit too, then router.refresh()). */
export type ActionSheetProps = {
  trip: Trip;
  plan: PlanView;
  open: boolean;
  onDone: () => void;
};
