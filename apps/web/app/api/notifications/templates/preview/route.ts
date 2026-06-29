import { requireAdmin } from "@/lib/auth/guards";
import { renderEmailTemplate } from "@/lib/notifications/render-email";
import { sampleVars } from "@/lib/services/notification-template.service";

/** Render a template (with sample data) to email HTML for the editor iframe. */
export async function POST(req: Request): Promise<Response> {
  await requireAdmin();
  const { event, subject, body } = await req.json();
  const { html } = await renderEmailTemplate({ subject, body, vars: sampleVars(event) });
  return new Response(html, { headers: { "content-type": "text/html" } });
}
