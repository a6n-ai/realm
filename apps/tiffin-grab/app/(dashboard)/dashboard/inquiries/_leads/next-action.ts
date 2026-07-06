import type { InquiryStage } from "@/lib/services/inquiries.service";

export type NextActionKind =
  | { kind: "activity"; activity: "call" | "quote_sent" | "payment_link_sent" }
  | { kind: "convert" }
  | { kind: "view_order" }
  | { kind: "stage"; to: InquiryStage }
  | null;

export type NextAction = { label: string; action: NextActionKind } | null;

export function nextAction(stage: InquiryStage): NextAction {
  switch (stage) {
    case "new": return { label: "Log a call", action: { kind: "activity", activity: "call" } };
    case "contacted": return { label: "Share a quote", action: { kind: "activity", activity: "quote_sent" } };
    case "quoted": return { label: "Follow up on the quote", action: { kind: "stage", to: "follow_up" } };
    case "follow_up": return { label: "Convert to order", action: { kind: "convert" } };
    case "converted": return { label: "View order", action: { kind: "view_order" } };
    case "lost": return { label: "Reopen", action: { kind: "stage", to: "new" } };
  }
}
