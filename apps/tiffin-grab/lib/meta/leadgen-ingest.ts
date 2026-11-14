import { createLogger } from "@foundry/commons/logger";
import {
  fetchMetaLead,
  normalizeMetaLeadId,
  parseLeadgenWebhook,
  verifyLeadgenSignature,
} from "@foundry/meta-pixel";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { inquiries } from "@/db/schema";
import { inquiriesService } from "@/lib/inquiries/inquiries.service";
import { metaPixel } from "@/lib/services/meta-pixel/config";
import { sendMetaCrmLeadCreated } from "./crm-lead";

const log = createLogger("meta-leadgen-ingest");

/**
 * Meta leadgen webhook POST. Always safe to retry (unique meta_lead_id + event_id).
 */
export async function ingestMetaLeadgenWebhook(
  rawBody: string,
  signatureHeader: string | null,
): Promise<{ ok: true; ingested: number } | { ok: false; error: string; status: 400 | 401 | 503 }> {
  const conn = await metaPixel.leadgenConnection();
  if (!conn) {
    return { ok: false, error: "Lead Ads ingest is not configured", status: 503 };
  }
  if (conn.appSecret && !verifyLeadgenSignature(rawBody, signatureHeader, conn.appSecret)) {
    return { ok: false, error: "Invalid signature", status: 401 };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody) as unknown;
  } catch {
    return { ok: false, error: "Invalid JSON", status: 400 };
  }

  const entries = parseLeadgenWebhook(parsed);
  let ingested = 0;
  for (const entry of entries) {
    const ok = await ingestOneLeadgen(entry.leadgenId, conn.pageAccessToken, entry.createdTime);
    if (ok) ingested += 1;
  }
  return { ok: true, ingested };
}

async function ingestOneLeadgen(
  leadgenId: string,
  pageAccessToken: string,
  createdTime?: number,
): Promise<boolean> {
  const leadId = normalizeMetaLeadId(leadgenId);
  if (!leadId) return false;

  const existing = await findByMetaLeadId(leadId);
  if (existing) {
    sendMetaCrmLeadCreated(
      {
        publicId: existing.publicId,
        metaLeadId: existing.metaLeadId,
        email: existing.email,
        phone: existing.phone,
        fullName: existing.fullName,
      },
      createdTime,
    );
    return true;
  }

  const lead = await fetchMetaLead(leadId, pageAccessToken);
  if (!lead) {
    log.warn({ leadId }, "meta leadgen fetch returned null");
    return false;
  }

  const phone = lead.phone?.trim() || null;
  const email = lead.email?.trim() || null;
  const fullName = lead.fullName?.trim() || null;
  if (!phone && !fullName && !email) {
    log.warn({ leadId }, "meta leadgen lead has no contact fields");
    return false;
  }

  try {
    // createOrFold fires CRM Lead when metaLeadId is new; attaches lead_id on fold.
    await inquiriesService.createOrFold({
      fullName: fullName ?? undefined,
      phone: phone ?? undefined,
      email: email ?? undefined,
      sourceKey: "facebook",
      subSourceKey: "facebook_ads",
      metaLeadId: leadId,
      notes: "Meta Instant Form lead",
    });
    return true;
  } catch (err) {
    log.error({ err, leadId }, "meta leadgen inquiry create failed");
    return false;
  }
}

async function findByMetaLeadId(leadId: string) {
  const [row] = await db
    .select({
      publicId: inquiries.publicId,
      metaLeadId: inquiries.metaLeadId,
      email: inquiries.email,
      phone: inquiries.phone,
      fullName: inquiries.fullName,
    })
    .from(inquiries)
    .where(eq(inquiries.metaLeadId, leadId))
    .limit(1);
  return row ?? null;
}
