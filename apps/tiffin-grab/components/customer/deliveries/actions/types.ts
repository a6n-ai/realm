import type { Trip } from "@/lib/deliveries-view";
import type { PlanView } from "../adapter";
import type { SheetUi } from "./sheet-ui";

/** Contract every action sheet implements. Mounted only while its action is active. */
export type ActionSheetProps = {
  /** Vacation is not a trip action, so the shell may mount it without one. */
  trip: Trip;
  plan: PlanView;
  /** Eating day the customer selected; pick/swap open on it. */
  day?: string;
  open: boolean;
  /** Closes the sheet. With a message the shell also toasts it and refreshes; call it right after a successful commit. */
  onDone: (message?: string) => void;
  /** Toasts and refreshes but keeps the sheet open (swap stacks several changes). */
  onChanged?: (message: string) => void;
  /** Look only (kit by default; admin passes shadcn). Logic never changes with it. */
  ui?: Partial<SheetUi>;
};
