import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { SesEmailProvider } from "@tiffin/commons-notify";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { renderEmailTemplate } from "@/lib/notifications/render-email";
import { sampleVars } from "@/lib/services/notification-template.service";
import { getSession } from "@/lib/auth/session";

/** Send a rendered template (with sample data) to the acting admin's email. */
export async function POST(req: Request): Promise<Response> {
  await requireAdmin();
  const { event, subject, body } = await req.json();

  const publicId = (await getSession())?.user?.id;
  if (!publicId) return new Response("unauthorized", { status: 401 });
  const [admin] = await db.select({ email: users.email }).from(users).where(eq(users.publicId, publicId));
  if (!admin?.email) return new Response("admin has no email", { status: 422 });

  const provider = new SesEmailProvider({
    region: process.env.AWS_REGION,
    configurationSetName: process.env.SES_CONFIGURATION_SET,
    defaultFrom: {
      email: process.env.NOTIFY_FROM_EMAIL ?? "noreply@tiffingrab.ca",
      name: process.env.NOTIFY_FROM_NAME ?? "Tiffin Grab",
    },
  });
  const rendered = await renderEmailTemplate({ subject, body, vars: sampleVars(event) });
  await provider.send({
    to: { email: admin.email },
    subject: `[TEST] ${rendered.subject}`,
    html: rendered.html,
    text: rendered.text,
  });
  return Response.json({ sent: true });
}
