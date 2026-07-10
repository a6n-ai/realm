// Plain module (no "use client") so a Server Component can safely import these constants.
// A Server Component may not import a *value* from a "use client" module — it arrives as a
// client reference and things like `.map` silently stop being functions. See deliveries-panel.tsx.

export type DeliveryStatus = "scheduled" | "paused" | "skipped" | "cancelled";

export const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  scheduled: "Scheduled",
  paused: "Paused",
  skipped: "Skipped",
  cancelled: "Cancelled",
};

type Variant = "neutral" | "ok" | "warn" | "bad";

export const DELIVERY_STATUS_VARIANT: Record<DeliveryStatus, Variant> = {
  scheduled: "ok",
  paused: "warn",
  skipped: "bad",
  cancelled: "neutral",
};

export type DeliveryRow = {
  publicId: string;
  deliveryDate: string;
  status: DeliveryStatus;
  cutoffAt: number;
  isMakeup: boolean;
  makeupForDate: string | null;
  address: { fullName: string; addressLine: string; city: string; postalCode: string };
};
