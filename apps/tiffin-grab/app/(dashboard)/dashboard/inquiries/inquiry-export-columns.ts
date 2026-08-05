// Single source of truth for the inquiries Excel export's column headers.
import type { inquiriesService } from "@/lib/services/inquiries.service";

export type ExportRow = Awaited<ReturnType<typeof inquiriesService.listForExport>>[number];

const STAGE_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  quoted: "Quoted",
  follow_up: "Follow-up",
  converted: "Converted",
  lost: "Lost",
};

const LOST_REASON_LABELS: Record<string, string> = {
  price: "Price",
  out_of_zone: "Out of zone",
  no_response: "No response",
  chose_competitor: "Chose competitor",
  not_ready: "Not ready",
  other: "Other",
};

export const EXPORT_COLUMNS = [
  "Name",
  "Phone",
  "Email",
  "Source",
  "Sub Source",
  "Stage",
  "Owner",
  "Created",
  "Last Touch",
  "Next Follow-up",
  "Overdue",
  "Plan Interest",
  "Meal Size Interest",
  "Persons",
  "Postal Code",
  "Preferred Start",
  "Quoted Price",
  "Lost Reason",
  "Notes",
] as const;

// The pg driver returns raw sql<number> aggregate/subquery bigint columns (agg.lastTouchAt,
// the nextFollowUpAt correlated subquery) as strings, not numbers, unlike plain column
// selects — Number() coerces either; the bare Date constructor's string overload would
// instead try (and fail) to parse a numeric string as a date string.
function epochToDate(ms: number | string | null | undefined): string {
  if (ms == null) return "";
  const n = Number(ms);
  return Number.isFinite(n) ? new Date(n).toISOString().slice(0, 10) : "";
}

export function inquiryRowToExcelRecord(row: ExportRow): Record<string, string | number> {
  return {
    Name: row.fullName,
    Phone: row.phone,
    Email: row.email ?? "",
    Source: row.source,
    "Sub Source": row.subSource ?? "",
    Stage: STAGE_LABELS[row.stage] ?? row.stage,
    Owner: row.ownerName ?? "",
    Created: epochToDate(row.createdAt),
    "Last Touch": epochToDate(row.lastTouchAt),
    "Next Follow-up": epochToDate(row.nextFollowUpAt),
    Overdue: row.overdue ? "Yes" : "No",
    "Plan Interest": row.planInterest ?? "",
    "Meal Size Interest": row.mealSizeInterest ?? "",
    Persons: row.personsInterest ?? "",
    "Postal Code": row.postalCode ?? "",
    "Preferred Start": row.preferredStart ?? "",
    "Quoted Price": row.quotedPrice ?? "",
    "Lost Reason": row.lostReason ? (LOST_REASON_LABELS[row.lostReason] ?? row.lostReason) : "",
    Notes: row.notes ?? "",
  };
}
