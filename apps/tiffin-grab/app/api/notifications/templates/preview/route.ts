import { renderEmailTemplate } from "@relay/email";
import { adminRoute } from "@/lib/notifications/admin-route";
import { sampleVars } from "@/lib/notifications/notification-template.service";

/** Render a template (with sample data) to email HTML for the editor iframe. */
export const POST = adminRoute(async (req) => {
  const { event, subject, body } = await req.json();
  const { html } = await renderEmailTemplate({ subject, body, vars: sampleVars(event), appName: "Tiffin Grab" });
  return new Response(html, { headers: { "content-type": "text/html" } });
});
