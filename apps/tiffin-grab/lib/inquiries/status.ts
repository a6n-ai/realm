import { ValidationError } from "@foundry/commons";

export const SUB_STATUSES = [
  "no_response",
  "responded",
  "lost",
  "undeliverable",
  "future",
  "persistent",
  "expected",
  "pending_payment",
  "took_plan",
  "took_trial",
] as const;

export type SubStatus = (typeof SUB_STATUSES)[number];
export type StatusGroup = "lead" | "follow_up";
export type InquiryStage = "new" | "contacted" | "follow_up" | "converted" | "lost";

type SubStatusMeta = { label: string; group: StatusGroup; closes: boolean; pickable: boolean };

export const SUB_STATUS_META: Record<SubStatus, SubStatusMeta> = {
  no_response: { label: "No response", group: "lead", closes: false, pickable: true },
  responded: { label: "Responded", group: "lead", closes: false, pickable: true },
  lost: { label: "Lost", group: "lead", closes: true, pickable: true },
  undeliverable: { label: "Undeliverable", group: "lead", closes: true, pickable: true },
  future: { label: "Will take in future", group: "follow_up", closes: false, pickable: true },
  persistent: { label: "Persistent contact", group: "follow_up", closes: false, pickable: true },
  expected: { label: "Expected", group: "follow_up", closes: false, pickable: true },
  pending_payment: { label: "Pending payment", group: "follow_up", closes: false, pickable: true },
  took_plan: { label: "Took a plan", group: "follow_up", closes: true, pickable: false },
  took_trial: { label: "Took a trial", group: "follow_up", closes: true, pickable: false },
};

export const CLOSE_OPTIONS: SubStatus[] = ["lost", "undeliverable"];

const CONVERT_ONLY: ReadonlySet<SubStatus> = new Set(["took_plan", "took_trial"]);

export function stageFor(sub: SubStatus | null): InquiryStage {
  if (sub === null || sub === "no_response") return "new";
  if (sub === "responded") return "contacted";
  if (sub === "lost" || sub === "undeliverable") return "lost";
  if (CONVERT_ONLY.has(sub)) return "converted";
  return "follow_up";
}

// Responded moves the lead into Follow-up even though its meta lists it under lead.
export function groupFor(sub: SubStatus | null): StatusGroup {
  if (sub === null) return "lead";
  if (sub === "responded") return "follow_up";
  return SUB_STATUS_META[sub].group;
}

export function isClosed(sub: SubStatus | null): boolean {
  return sub !== null && SUB_STATUS_META[sub].closes;
}

export function statusLabel(sub: SubStatus | null): string {
  return sub === null ? "New" : SUB_STATUS_META[sub].label;
}

export function assertTransition(from: SubStatus | null, to: SubStatus | null): void {
  if (to !== null && CONVERT_ONLY.has(to)) {
    throw new ValidationError("Plans and trials are recorded by converting the inquiry");
  }
  if (from === to) return;
  if (from !== null && CONVERT_ONLY.has(from)) {
    throw new ValidationError("A converted inquiry cannot change status");
  }
  if (isClosed(from)) {
    if (to === null) return;
    throw new ValidationError("A closed inquiry can only be reopened as New");
  }
  if (to === null) {
    throw new ValidationError("An open inquiry cannot be reset to New");
  }
}
