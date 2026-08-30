/** Where an order sits on its timeline. Rendering is the app's problem. */
export type TrackingStepState = "done" | "current" | "upcoming" | "failed";

export type TrackingStep = {
  key: string;
  label: string;
  state: TrackingStepState;
  /** Epoch ms this step was reached, when known. */
  at?: number;
  detail?: string;
};

export type TrackingLine = {
  name: string;
  quantity: number;
  lineTotal: number;
  modifiers?: string[];
};

export type TrackingTotals = {
  currency: string;
  subtotal: number;
  tax: number;
  discount?: number;
  total: number;
  /** Still owed. 0 once the order is settled. */
  balanceDue: number;
};

/**
 * What the customer may do from the tracking page. The package only reports
 * which actions are open; the app owns every write.
 */
export type TrackingAction = "pay_balance" | "request_cancel" | "add_note";

/**
 * App-agnostic view of one order. A puchkaman pickup order and a tiffin-grab
 * delivery both reduce to a step list plus lines, which is the whole reason
 * this type is not shaped like either one's table.
 */
export type TrackedOrder = {
  /** Human-facing reference — the order's public id. */
  reference: string;
  placedAt: number;
  steps: TrackingStep[];
  /** True once no further status change is expected — stops the client poll. */
  terminal: boolean;
  lines: TrackingLine[];
  totals: TrackingTotals;
  fulfillment: {
    kind: string;
    /** "Pickup at …" / "Delivery to …" — already formatted by the app. */
    summary: string;
    address?: string;
    /** Epoch ms, for scheduled fulfilment. */
    scheduledFor?: number;
    /** Present only when the address resolved to a place at checkout. */
    lat?: number;
    lng?: number;
  };
  // No phone here on purpose: the number is the PIN source, so it stays in the
  // access path (`TrackingSubject`) and never reaches a rendered view model.
  contact: {
    name: string;
    email?: string;
  };
  actions: TrackingAction[];
};
