import type { SubStatus } from "@/lib/inquiries/status";

export type NextActionKind =
  | { kind: "activity"; activity: "call" }
  | { kind: "status" }
  | { kind: "convert" }
  | { kind: "view_order" }
  | null;

export type NextAction = { label: string; action: NextActionKind } | null;

export function nextAction(sub: SubStatus | null): NextAction {
  switch (sub) {
    case null:
    case "no_response": return { label: "Log a call", action: { kind: "activity", activity: "call" } };
    case "responded":
    case "future":
    case "persistent": return { label: "Set a follow-up", action: { kind: "status" } };
    case "expected":
    case "pending_payment": return { label: "Convert to order", action: { kind: "convert" } };
    case "took_plan":
    case "took_trial": return { label: "View order", action: { kind: "view_order" } };
    case "lost":
    case "undeliverable": return { label: "Reopen", action: { kind: "status" } };
  }
}
