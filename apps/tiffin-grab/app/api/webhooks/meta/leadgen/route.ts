import { verifyLeadgenChallenge } from "@foundry/meta-pixel";
import { ingestMetaLeadgenWebhook } from "@/lib/meta/leadgen-ingest";
import { metaPixel } from "@/lib/services/meta-pixel/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Meta Instant Forms leadgen webhook.
 * GET: hub challenge verification. POST: new leads → CRM inquiries + CRM Lead CAPI.
 * Configure in Meta App → Webhooks → Page → leadgen → callback URL.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const conn = await metaPixel.leadgenConnection();
  if (!conn) return new Response("Lead Ads ingest is not configured", { status: 503 });
  const challenge = verifyLeadgenChallenge({
    mode: url.searchParams.get("hub.mode"),
    verifyToken: url.searchParams.get("hub.verify_token"),
    challenge: url.searchParams.get("hub.challenge"),
    expectedVerifyToken: conn.verifyToken,
  });
  if (!challenge) return new Response("Forbidden", { status: 403 });
  return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
}

export async function POST(req: Request) {
  const raw = await req.text();
  const res = await ingestMetaLeadgenWebhook(raw, req.headers.get("x-hub-signature-256"));
  if (!res.ok) return new Response(res.error, { status: res.status });
  // Meta expects 200 quickly; failures on individual leads are logged inside ingest.
  return Response.json({ ok: true, ingested: res.ingested });
}
