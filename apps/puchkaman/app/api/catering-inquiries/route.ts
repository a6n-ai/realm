import { handler, json, problem } from "@foundry/routes";
import { createLogger } from "@foundry/commons/logger";
import { db } from "@/db/client";
import { enqueueNotification } from "@/lib/notifications/enqueue";
import { cateringInquirySchema } from "@/lib/catering/schema";
import { createCateringInquiry } from "@/lib/services/catering.service";
import { cateringRegionTag } from "@/lib/links";

const log = createLogger("catering-inquiries");
// Both regions notify one shared inbox today. That is why every enquiry
// carries a region and why the subject line leads with it: a Vancouver job and
// a Toronto job are otherwise indistinguishable in the inbox, and neither
// filters nor forwarding rules have anything to key on. If the Vancouver team
// ever gets its own address, make this a per-region lookup — the region is
// already on the inquiry, so nothing else has to change.
const NOTIFY_TO = "puchkamancanada@gmail.com";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

// Public (unauthenticated) endpoint — the catering page's "Request a
// Catering Quote" form. No WhatsApp Business API account exists, so that
// channel is handled client-side (a wa.me link the customer sends
// themselves); this route only covers the email side, which we can actually
// deliver automatically via the SES provider already wired up for auth mail.
export const POST = handler(async (request: Request): Promise<Response> => {
  const parsed = cateringInquirySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(400, parsed.error.issues[0]?.message ?? "Invalid request");
  const inquiry = parsed.data;

  await createCateringInquiry(inquiry);

  const rows: [string, string][] = [
    ["Name", inquiry.name],
    ["Phone", inquiry.phone],
    ["Email", inquiry.email],
    ["Event date", inquiry.date],
    ["Service area", inquiry.region],
    ["Location", inquiry.location],
    ["Guests", inquiry.guests],
    ["Type", inquiry.type],
    ...(inquiry.allergies ? ([["Food allergies", inquiry.allergies]] as [string, string][]) : []),
    ...(inquiry.message ? ([["Message", inquiry.message]] as [string, string][]) : []),
  ];

  try {
    // Routed through the notification outbox (2026-09) so this lands in Logs
    // like every other email, and admins can edit the copy from Templates.
    // No replyTo support in the outbox pipeline — the inquirer's email is in
    // the details table below, so staff can reply manually.
    await db.transaction((tx) =>
      enqueueNotification(tx, {
        event: "catering_inquiry",
        recipientEmail: NOTIFY_TO,
        title: `Catering quote — ${inquiry.name}`,
        body: "",
        channels: ["email"],
        kind: "transactional",
        data: {
          name: inquiry.name,
          phone: inquiry.phone,
          email: inquiry.email,
          date: inquiry.date,
          region: cateringRegionTag(inquiry.region),
          location: inquiry.location,
          guests: inquiry.guests,
          type: inquiry.type,
          allergies: inquiry.allergies ?? "",
          message: inquiry.message ?? "",
          rowsHtml: `<table>${rows.map(([k, v]) => `<tr><td><strong>${escapeHtml(k)}</strong></td><td>${escapeHtml(v)}</td></tr>`).join("")}</table>`,
          rowsText: rows.map(([k, v]) => `${k}: ${v}`).join("\n"),
        },
      }),
    );
  } catch (e) {
    // Don't fail the request over a delivery hiccup — the customer's WhatsApp
    // link (sent client-side regardless) is the redundant channel.
    log.error({ err: e instanceof Error ? e.message : e }, "failed to enqueue catering inquiry email");
    return problem(502, "Could not send notification email");
  }

  return json({ ok: true });
});
