import { handler } from "@foundry/routes";
import { renderEmailTemplate } from "@relay/email";
import { requireAdmin } from "@/lib/auth/guards";
import { sampleVars } from "@/lib/services/notification-template.service";

/** Render a template (with sample data) to email HTML for the editor iframe. */
export const POST = handler(async (req: Request): Promise<Response> => {
  await requireAdmin();
  const { event, subject, body } = await req.json();
  const { html } = await renderEmailTemplate({
    subject,
    body,
    vars: sampleVars(event),
    appName: "Puchkaman",
  });
  return new Response(html, { headers: { "content-type": "text/html" } });
});
