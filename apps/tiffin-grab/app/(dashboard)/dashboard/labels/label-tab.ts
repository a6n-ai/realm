// Plain module: page.tsx (server) reads LABEL_TABS, and a constant exported from a
// "use client" file reaches the server as a client reference, not the array.
export const LABEL_TABS = ["packing", "deliveries", "kitchen", "labels"] as const;
export type LabelTab = (typeof LABEL_TABS)[number];
