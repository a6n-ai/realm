import { parseFilterState, type FacetDef } from "@/components/ds";
import { inquiryBucketWhere, type QueueTab } from "@/lib/inquiries/inquiries.service";
import { LOST_REASON_LABELS } from "@/lib/inquiries/lost-reason";
import { SUB_STATUSES, SUB_STATUS_META } from "@/lib/inquiries/status";
import { withListDates } from "@/lib/list/default-month";
import { parseInquiryBucket } from "@/lib/list/inquiries-drill";
import { ALL_OWNERS, ME, resolveOwnerParam } from "@/lib/list/presets";

type Option = { value: string; label: string };
type SpecOptions = { owners: Option[]; sources: Option[]; subsources: (Option & { parent?: string })[]; zones: Option[] };

// "none" is New (sub_status is null); the resolver maps it to `is null`.
const SUB_STATUS_FACET_OPTIONS = [
  { value: "none", label: "New" },
  ...SUB_STATUSES.map((s) => ({ value: s, label: SUB_STATUS_META[s].label })),
];

const QUEUES: QueueTab[] = ["due", "overdue", "upcoming", "open", "closed", "quick"];

// Facet spec is server-authored so parseFilterState (server) and FacetFilters
// (client) read the same shape. Search is the "search" facet — rendered by the
// nav-bar search, not FacetFilters — and its OR(fullName, phone) is folded into
// the condition. Options only label the controls, so the export passes none.
export function inquirySpec({ owners, sources, subsources, zones }: SpecOptions): FacetDef[] {
  return [
    { kind: "pills", field: "subStatus", label: "Status", options: SUB_STATUS_FACET_OPTIONS },
    { kind: "select", field: "owner", label: "Owner", options: [{ value: ME, label: "Me" }, { value: ALL_OWNERS, label: "All owners" }, ...owners] },
    { kind: "multi", field: "source", label: "Source", options: sources },
    { kind: "multi", field: "subsource", label: "Subsource", options: subsources, dependsOn: "source" },
    { kind: "multi", field: "zone", label: "Zone", options: zones },
    { kind: "multi", field: "lostReason", label: "Lost reason", options: Object.entries(LOST_REASON_LABELS).map(([value, label]) => ({ value, label })) },
    { kind: "dateRange", field: "createdAt", label: "Created" },
    { kind: "search", fields: ["fullName", "phone", "email"] },
  ];
}

/** The Leads list's URL as a query: the page and the export read it the same way. */
export async function inquiryListQuery(raw: Record<string, string | undefined>, viewer: string | undefined, spec = inquirySpec({ owners: [], sources: [], subsources: [], zones: [] })) {
  const sp = await withListDates(raw);
  const bucket = parseInquiryBucket(sp.bucket);
  const queue = QUEUES.find((q) => q === sp.queue) ?? "due";
  const { condition, page } = parseFilterState(spec, { ...sp, owner: resolveOwnerParam(sp.owner, viewer) });
  // A KPI drill-down replaces the queue tab: the card counted every matching inquiry.
  return { sp, bucket, queue, condition, page, bucketWhere: bucket ? inquiryBucketWhere(bucket) : undefined };
}
