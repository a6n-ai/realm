import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { SesEmailProvider } from "@realm/email";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";

/** Send a pre-rendered template (html/text from the client editor) to the acting admin's email. */
export async function POST(req: Request): Promise<Response> {
  await requireAdmin();
  const { subject, html, text, to } = await req.json();

  const publicId = (await getSession())?.user?.id;
  if (!publicId) return new Response("unauthorized", { status: 401 });
  const [admin] = await db.select({ email: users.email }).from(users).where(eq(users.publicId, publicId));
  if (!admin?.email) return new Response("admin has no email", { status: 422 });

  // Default to the acting admin; allow an explicit recipient for cross-client testing.
  const recipient = typeof to === "string" && to.trim() ? to.trim() : admin.email;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return new Response("invalid recipient", { status: 422 });
  }

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
    html,
    text,
  });
  return Response.json({ sent: true });
}
