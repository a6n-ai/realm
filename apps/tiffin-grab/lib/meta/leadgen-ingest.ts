import { createLogger } from "@foundry/commons/logger";
import {
  fetchMetaLead,
  normalizeMetaLeadId,
  parseLeadgenWebhook,
  verifyLeadgenSignature,
} from "@foundry/meta-pixel";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { inquiries, leadSources, leadSubsources } from "@/db/schema";
import { parsePhone } from "@/lib/services/contact";
import { inquiriesService } from "@/lib/inquiries/inquiries.service";
import { metaPixel } from "@/lib/services/meta-pixel/config";
import { sendMetaCrmLeadCreated } from "./crm-lead";

const log = createLogger("meta-leadgen-ingest");

/** Inquiries source / subsource for Meta Instant Forms. Sub-status stays unset, which is New. */
const INSTANT_FORMS_SOURCE = "facebook";
const INSTANT_FORMS_SUBSOURCE = "instant_forms";
const INSTANT_FORMS_LABEL = "Instant Forms";

const CONTACT_FIELDS = new Set([
  "email",
  "email_address",
  "phone_number",
  "phone",
  "mobile_number",
  "work_phone_number",
  "full_name",
  "fullname",
  "first_name",
  "last_name",
]);

const POSTAL_FIELDS = ["postal_code", "post_code", "postcode", "zip_code", "zip"];

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

  const email = lead.email?.trim() || null;
  const rawPhone = lead.phone?.trim() || null;
  const phone = usablePhone(rawPhone);
  // Email-only forms have no name or phone. A name is required to open the inquiry.
  let fullName = lead.fullName?.trim() || null;
  if (!fullName && !phone && email) fullName = email.split("@")[0] || null;
  if (!phone && !fullName && !email) {
    log.warn({ leadId }, "meta leadgen lead has no contact fields");
    return false;
  }

  try {
    await ensureInstantFormsSubsource();
    // subStatus omitted: null is New (stage "new"). createOrFold fires CRM Lead when metaLeadId is new.
    await inquiriesService.createOrFold({
      fullName: fullName ?? undefined,
      phone: phone ?? undefined,
      email: email ?? undefined,
      postalCode: pickField(lead.fieldData, POSTAL_FIELDS),
      sourceKey: INSTANT_FORMS_SOURCE,
      subSourceKey: INSTANT_FORMS_SUBSOURCE,
      metaLeadId: leadId,
      notes: formNotes(lead.fieldData, phone ? undefined : rawPhone ?? undefined),
    });
    return true;
  } catch (err) {
    log.error({ err, leadId }, "meta leadgen inquiry create failed");
    return false;
  }
}

/** Catalog row so the inquiry can store Instant Forms even on a DB seeded before this subsource existed. */
async function ensureInstantFormsSubsource(): Promise<void> {
  const [existing] = await db
    .select({ id: leadSubsources.id })
    .from(leadSubsources)
    .where(eq(leadSubsources.key, INSTANT_FORMS_SUBSOURCE))
    .limit(1);
  if (existing) return;

  const [src] = await db
    .select({ id: leadSources.id })
    .from(leadSources)
    .where(eq(leadSources.key, INSTANT_FORMS_SOURCE))
    .limit(1);
  if (!src) {
    log.warn("facebook lead source missing; Instant Forms subsource not created");
    return;
  }
  await db.insert(leadSubsources).values({
    sourceId: src.id,
    key: INSTANT_FORMS_SUBSOURCE,
    label: INSTANT_FORMS_LABEL,
  });
}

function usablePhone(raw: string | null): string | null {
  if (!raw) return null;
  try {
    parsePhone(raw);
    return raw;
  } catch {
    return null;
  }
}

function pickField(map: Record<string, string>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = map[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function formNotes(fieldData: Record<string, string>, droppedPhone?: string): string {
  const lines = ["Instant Forms"];
  if (droppedPhone) lines.push(`Phone: ${droppedPhone}`);
  for (const [key, value] of Object.entries(fieldData)) {
    if (CONTACT_FIELDS.has(key) || !value.trim()) continue;
    lines.push(`${key.replaceAll("_", " ")}: ${value.trim()}`);
  }
  return lines.join("\n");
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
