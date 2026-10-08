import type { Tone } from "@/components/ds/tone-pill";
import type { LabelDeliveryStatus } from "@/lib/services/daily-labels.service";

// One colour per label status, shared by Daily labels and the Dispatch Day table so the
// same day reads the same on both pages.
const TONE: Record<LabelDeliveryStatus, Tone> = {
  "To be delivered": "brand",
  "Awaiting confirmation": "warn",
  Delivered: "ok",
  "Not delivered": "bad",
  "On hold": "neutral",
  Paused: "neutral",
  Cancelled: "faint",
};

export function labelStatusTone(status: string): Tone {
  return TONE[status as LabelDeliveryStatus] ?? "neutral";
}
