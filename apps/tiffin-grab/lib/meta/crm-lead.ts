import { normalizeMetaLeadId } from "@foundry/meta-pixel";
import { statusLabel, type SubStatus } from "@/lib/inquiries/status";
import { sendMetaEvent } from "./capi";

/** CRM product name Meta shows as lead_event_source. */
export const META_CRM_LEAD_EVENT_SOURCE = "TiffinGrab";

/** Ads Manager “qualified” optimization target — fired on convert (took_plan / took_trial). */
export const META_CRM_QUALIFIED_EVENT = "QualifiedLead";

export type MetaCrmInquiry = {
  publicId: string;
  metaLeadId: string | null;
  email: string | null;
  phone: string | null;
  fullName: string | null;
};

/**
 * Fire a CRM Conversions API stage event for Instant Forms leads.
 * No-ops without a Meta lead_id (website leads stay on the website Pixel path).
 */
export function sendMetaCrmLeadEvent(input: {
  inquiry: MetaCrmInquiry;
  /** Stable per inquiry + stage so Meta dedupes retries. */
  eventId: string;
  eventName: string;
  eventTime?: number;
}): void {
  const leadId = normalizeMetaLeadId(input.inquiry.metaLeadId);
  if (!leadId) return;

  sendMetaEvent({
    eventName: input.eventName,
    eventId: input.eventId,
    eventTime: input.eventTime ?? Math.floor(Date.now() / 1000),
    actionSource: "system_generated",
    userData: {
      leadId,
      email: input.inquiry.email,
      phone: input.inquiry.phone,
      fullName: input.inquiry.fullName,
      country: "ca",
    },
    customData: {
      event_source: "crm",
      lead_event_source: META_CRM_LEAD_EVENT_SOURCE,
    },
  });
}

/** Initial CRM Lead when an Instant Form is ingested (or metaLeadId is first attached). */
export function sendMetaCrmLeadCreated(inquiry: MetaCrmInquiry, eventTime?: number): void {
  sendMetaCrmLeadEvent({
    inquiry,
    eventName: "Lead",
    eventId: `crm:${inquiry.publicId}:Lead`,
    eventTime,
  });
}

/** Staff pipeline status change → CRM stage event (not convert). */
export function sendMetaCrmLeadStatus(inquiry: MetaCrmInquiry, subStatus: SubStatus | null): void {
  const name = statusLabel(subStatus) || "New";
  // event_id must be stable and URL-safe; event_name keeps the human CRM label.
  const idSlug = name.replace(/\s+/g, "_");
  sendMetaCrmLeadEvent({
    inquiry,
    eventName: name,
    eventId: `crm:${inquiry.publicId}:${idSlug}`,
  });
}

/** Converted inquiry — the Qualified Leads optimization event. */
export function sendMetaCrmQualifiedLead(inquiry: MetaCrmInquiry): void {
  sendMetaCrmLeadEvent({
    inquiry,
    eventName: META_CRM_QUALIFIED_EVENT,
    eventId: `crm:${inquiry.publicId}:${META_CRM_QUALIFIED_EVENT}`,
  });
}
