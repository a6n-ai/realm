import type { Tone } from "./tone";
import { LABEL_STATUS as S, type LabelDeliveryStatus } from "./label-status";

// One colour per label status, shared by Daily labels and the Dispatch Day table so the
// same day reads the same on both pages.
const TONE: Record<LabelDeliveryStatus, Tone> = {
  [S.toBeDelivered]: "brand",
  [S.awaitingConfirmation]: "warn",
  [S.delivered]: "ok",
  [S.notDelivered]: "bad",
  [S.onHold]: "neutral",
  [S.paused]: "neutral",
  [S.holiday]: "neutral",
  [S.cancelled]: "faint",
};

export function labelStatusTone(status: string): Tone {
  return TONE[status as LabelDeliveryStatus] ?? "neutral";
}
