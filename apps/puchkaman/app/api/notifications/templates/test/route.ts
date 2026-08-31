import { eq } from "drizzle-orm";
import { handler, problem } from "@foundry/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { getEmailProvider } from "@/lib/email/provider";

/** Send a pre-rendered template (html/text from the client editor) to the acting admin's email. */
export const POST = handler(async (req: Request): Promise<Response> => {
  await requireAdmin();
  const { subject, html, text, to } = await req.json();

  const publicId = (await getSession())?.user?.id;
  if (!publicId) return problem(401, "Unauthorized");
  const [admin] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.publicId, publicId));
  if (!admin?.email) return problem(422, "Acting admin has no email address");

  // Default to the acting admin; allow an explicit recipient for cross-client testing.
  const recipient = typeof to === "string" && to.trim() ? to.trim() : admin.email;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return problem(422, "Invalid recipient email");
  }

  // Goes through the app provider (not a bare SesEmailProvider) so the test send
  // lands in email_log like every other send.
  await getEmailProvider().send({
    to: { email: recipient },
    subject: `[TEST] ${subject}`,
    html,
    text,
  });
  return Response.json({ sent: true });
});
