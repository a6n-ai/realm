/**
 * Drill-through links from the Inquiries KPI cards. `bucket` is the same split
 * as groupCounts; the list skips the follow-up queue so the rows match the card.
 */

export type InquiryDrillBucket = "all" | "lead" | "follow_up" | "took" | "lost";

const BUCKETS: readonly InquiryDrillBucket[] = ["all", "lead", "follow_up", "took", "lost"];

export function parseInquiryBucket(value: string | undefined): InquiryDrillBucket | null {
  return BUCKETS.find((b) => b === value) ?? null;
}

export function inquiriesListHref(
  sp: { from?: string; to?: string },
  bucket?: InquiryDrillBucket,
): string {
  const qs = new URLSearchParams();
  if (sp.from) qs.set("from", sp.from);
  if (sp.to) qs.set("to", sp.to);
  if (bucket) qs.set("bucket", bucket);
  const s = qs.toString();
  return s ? `/dashboard/inquiries?${s}` : "/dashboard/inquiries";
}
