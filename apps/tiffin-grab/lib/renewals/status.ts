import type { RenewalStatus } from "@/lib/orders/queries";

export const TRACK_STATUSES = ["renewed", "unresponsive", "not_renewed", "expected", "follow_up", "pending_payment"] as const;
export type TrackStatus = (typeof TRACK_STATUSES)[number];

const LABELS: Record<TrackStatus, string> = {
  renewed: "Renewed",
  unresponsive: "Unresponsive",
  not_renewed: "Not renewed",
  expected: "Expected",
  follow_up: "Follow up",
  pending_payment: "Pending Payment",
};

export function trackLabel(s: TrackStatus | null): string {
  return s === null ? "New" : LABELS[s];
}

export function isClosedTrack(s: TrackStatus | null): boolean {
  return s === "renewed" || s === "not_renewed";
}

export function autoTrackStatus(computed: RenewalStatus): TrackStatus | null {
  if (computed === "renewed") return "renewed";
  if (computed === "unpaid" || computed === "waitlisted") return "pending_payment";
  return null;
}

// Mirrors the SQL: a later booking newer than the staff status overrides it.
export function effectiveTrackStatus(i: {
  staff: TrackStatus | null;
  staffSetAt: number | null;
  computed: RenewalStatus;
  laterBookedAt: number | null;
}): { status: TrackStatus | null; source: "staff" | "auto" | null } {
  const auto = autoTrackStatus(i.computed);
  if (auto && (i.staffSetAt == null || (i.laterBookedAt != null && i.laterBookedAt > i.staffSetAt))) {
    return { status: auto, source: "auto" };
  }
  if (i.staff) return { status: i.staff, source: "staff" };
  return { status: null, source: null };
}
