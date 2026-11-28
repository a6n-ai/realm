import type { Activity } from "../../lib/inquiries/queries";
import { STAGES, type Stage } from "../../lib/inquiries/stages";

export const STAGE_LABEL: Record<Stage, string> = {
  new: "New",
  contacted: "Contacted",
  requirements_gathered: "Requirements gathered",
  proposal_sent: "Proposal sent",
  negotiating: "Negotiating",
  won: "Won",
  lost: "Lost",
};

export const LOST_LABEL = {
  budget: "Budget",
  timing: "Timing",
  chose_competitor: "Chose a competitor",
  no_response: "No response",
  not_a_fit: "Not a fit",
  other: "Other",
} as const;

export const ACTIVITY_TYPES = [
  { value: "note", label: "Note" },
  { value: "call", label: "Call" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
] as const;

export const stageLabel = (s: string): string => (STAGES as readonly string[]).includes(s) ? STAGE_LABEL[s as Stage] : s;

const TYPE_LABEL: Record<string, string> = { note: "Note", call: "Call", whatsapp: "WhatsApp", email: "Email" };

export function describeActivity(a: Activity): string {
  switch (a.type) {
    case "created":
      return "Inquiry created";
    case "stage_change":
      return `Stage changed from ${stageLabel(a.fromStage ?? "")} to ${stageLabel(a.toStage ?? "")}`;
    case "reopened":
      return `Reopened at ${stageLabel(a.toStage ?? "")}`;
    case "reassigned":
      if (!a.fromOwnerName && a.toOwnerName === a.actorName) return `Claimed by ${a.toOwnerName}`;
      if (a.fromOwnerName && !a.toOwnerName) return `Reassigned from ${a.fromOwnerName} (removed)`;
      return `Assigned to ${a.toOwnerName ?? "nobody"}${a.fromOwnerName ? ` (was ${a.fromOwnerName})` : ""}`;
    default:
      return TYPE_LABEL[a.type] ?? a.type;
  }
}

const HUMAN_TYPES = ["note", "call", "whatsapp", "email"];
export const HUMAN_VERB: Record<string, string> = { note: "added a note", call: "logged a call", whatsapp: "logged a WhatsApp", email: "logged an email" };
export const isSystemActivity = (a: Pick<Activity, "type">): boolean => !HUMAN_TYPES.includes(a.type);

// Compact timeline line for events the system wrote, with the actor in front.
export function systemLine(a: Activity): string {
  const who = a.actorName ?? "Someone";
  switch (a.type) {
    case "created":
      return `${who} created this inquiry`;
    case "stage_change":
      return `${who} moved ${stageLabel(a.fromStage ?? "")} → ${stageLabel(a.toStage ?? "")}`;
    case "reopened":
      return `${who} reopened it at ${stageLabel(a.toStage ?? "")}`;
    case "reassigned":
      if (!a.fromOwnerName && a.toOwnerName === a.actorName) return `${who} claimed it`;
      if (a.fromOwnerName && !a.toOwnerName) return `Reassigned from ${a.fromOwnerName} (removed)`;
      return `${who} assigned it to ${a.toOwnerName ?? "nobody"}`;
    default:
      return describeActivity(a);
  }
}
