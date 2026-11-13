import type { SendState } from "@/lib/services/customers.service";

/** How far an invite or reminder email got, as a coloured status line for staff tables. */
export function sendTone(state: SendState | null, fmt: (ms: number) => string): { tone: string; status: string } {
  if (!state) return { tone: "text-bad", status: "Not sent yet" };
  if (state.status === "failed") return { tone: "text-bad", status: `Last send failed (${fmt(state.at)})` };
  if (state.openedAt) return { tone: "text-ok", status: `Opened ${fmt(state.openedAt)}` };
  if (state.deliveredAt) return { tone: "text-warn", status: `Delivered ${fmt(state.deliveredAt)}, not opened yet` };
  return { tone: "text-warn", status: `Sent ${fmt(state.at)}, not opened yet` };
}
