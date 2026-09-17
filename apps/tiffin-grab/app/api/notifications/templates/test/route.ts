import { eq } from "drizzle-orm";
import { handler, problem } from "@foundry/routes";
import { appendUnsubscribeFooter, buildCampaignConfig, buildUnsubscribeUrl } from "@relay/engine";
import { requireAdmin } from "@/lib/auth/guards";
import { SesEmailProvider } from "@relay/email";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { notificationTables } from "@/lib/notifications/tables";

/**
 * Send a pre-rendered template (html/text from the client editor) to the acting
 * admin's email. Also used by campaigns' "Send test" (EmailTemplateBuilder),
 * not just event templates, hence the event/campaign-agnostic body shape.
 */
export const POST = handler(async (req: Request): Promise<Response> => {
  await requireAdmin();
  const { subject, html, text, to } = await req.json();

  const publicId = (await getSession())?.user?.id;
  if (!publicId) return problem(401, "Unauthorized");
  const [admin] = await db.select({ email: users.email }).from(users).where(eq(users.publicId, publicId));
  if (!admin?.email) return problem(422, "Acting admin has no email address");

  // Default to the acting admin; allow an explicit recipient for cross-client testing.
  const recipient = typeof to === "string" && to.trim() ? to.trim() : admin.email;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return problem(422, "Invalid recipient email");
  }

  // A test send should show the same footer a real recipient gets — this is
  // exactly where an admin would notice it's missing (see appendUnsubscribeFooter);
  // no config means no footer, same as a real send, rather than faking one.
  const campaignConfig = buildCampaignConfig(notificationTables, process.env, { senderName: "TiffinGrab" });
  const stamped = campaignConfig
    ? appendUnsubscribeFooter(
        { html, text },
        {
          url: buildUnsubscribeUrl(campaignConfig.unsubscribe.baseUrl, campaignConfig.unsubscribe.secret, recipient),
          sender: campaignConfig.sender.name,
          address: campaignConfig.sender.postalAddress,
        },
      )
    : { html, text };

  const provider = new SesEmailProvider({
    region: process.env.AWS_REGION,
    configurationSetName: process.env.SES_CONFIGURATION_SET,
    defaultFrom: {
      email: process.env.NOTIFY_FROM_EMAIL ?? "noreply@tiffingrab.ca",
      name: process.env.NOTIFY_FROM_NAME ?? "Tiffin Grab",
    },
  });
  await provider.send({
    to: { email: recipient },
    subject: `[TEST] ${subject}`,
    html: stamped.html,
    text: stamped.text,
  });
  return Response.json({ sent: true, footerIncluded: !!campaignConfig });
});
