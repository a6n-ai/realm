// Plain module: page.tsx (server) reads LABEL_TABS, and a constant exported from a
// "use client" file reaches the server as a client reference, not the array.
export const LABEL_TABS = ["packing", "deliveries", "kitchen", "labels"] as const;
export type LabelTab = (typeof LABEL_TABS)[number];

/** Deliveries that leave the kitchen. Held, paused and cancelled rows stay on the list but are not stops. */
export const GOING_OUT = new Set(["To be delivered", "Awaiting confirmation", "Delivered"]);
