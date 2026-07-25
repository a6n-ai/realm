import { handler, json, problem } from "@realm/routes";
import { createLogger } from "@realm/commons/logger";
import { getEmailProvider } from "@/lib/email/provider";
import { cateringInquirySchema } from "@/lib/catering/schema";

const log = createLogger("catering-inquiries");
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

  const rows: [string, string][] = [
    ["Name", inquiry.name],
    ["Phone", inquiry.phone],
    ["Email", inquiry.email],
    ["Event date", inquiry.date],
    ["Location", inquiry.location],
    ["Guests", inquiry.guests],
    ["Type", inquiry.type],
    ...(inquiry.message ? ([["Message", inquiry.message]] as [string, string][]) : []),
  ];

  try {
    await getEmailProvider().send({
      to: { email: NOTIFY_TO },
      replyTo: { email: inquiry.email, name: inquiry.name },
      subject: `New catering quote request — ${inquiry.name} (${inquiry.guests} guests, ${inquiry.type})`,
      html: `<h2>New catering quote request</h2><table>${rows
        .map(([k, v]) => `<tr><td><strong>${escapeHtml(k)}</strong></td><td>${escapeHtml(v)}</td></tr>`)
        .join("")}</table>`,
      text: rows.map(([k, v]) => `${k}: ${v}`).join("\n"),
    });
  } catch (e) {
    // Don't fail the request over a delivery hiccup — the customer's WhatsApp
    // link (sent client-side regardless) is the redundant channel.
    log.error({ err: e instanceof Error ? e.message : e }, "failed to send catering inquiry email");
    return problem(502, "Could not send notification email");
  }

  return json({ ok: true });
});
