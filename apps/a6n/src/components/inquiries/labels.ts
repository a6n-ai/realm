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
