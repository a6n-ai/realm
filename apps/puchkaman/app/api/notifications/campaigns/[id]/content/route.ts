import { z } from "zod";
import { eq } from "drizzle-orm";
import { handler, json, problem } from "@realm/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { campaign, campaignContent } from "@/db/schema";

const schema = z.object({
  channel: z.enum(["email", "in_app", "sms", "whatsapp"]),
  locale: z.enum(["en", "fr"]),
  subject: z.string().trim().min(1),
  body: z.string().optional(),
  html: z.string().optional(),
  text: z.string().optional(),
  /** WhatsApp / templated SMS: the provider-side pre-approved template id. */
  providerTemplateId: z.string().trim().optional(),
});

export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> => {
    await requireAdmin();
    const { id } = await ctx.params;
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return problem(400, parsed.error.issues[0]?.message ?? "Invalid request");

    const [row] = await db
      .select({ id: campaign.id, status: campaign.status })
      .from(campaign)
      .where(eq(campaign.publicId, id));
    if (!row) return problem(404, "Campaign not found");
    // Editing copy after the outbox rows exist would not change what was sent,
    // and would make the stored content disagree with the delivered message.
    if (row.status !== "draft" && row.status !== "scheduled") {
      return problem(409, "Content can only be edited while a campaign is draft or scheduled");
    }

    const v = parsed.data;
    if (v.channel === "email" && (!v.html || !v.text)) {
      return problem(400, "Email content needs html and text");
    }
    if (v.channel !== "email" && !v.body && !v.providerTemplateId) {
      return problem(400, "Content needs a body or a provider template id");
    }

    await db
      .insert(campaignContent)
      .values({
        campaignId: row.id,
        channel: v.channel,
        locale: v.locale,
        subject: v.subject,
        body: v.body ?? null,
        html: v.html ?? null,
        text: v.text ?? null,
        providerTemplateId: v.providerTemplateId ?? null,
      })
      .onConflictDoUpdate({
        target: [campaignContent.campaignId, campaignContent.channel, campaignContent.locale],
        set: {
          subject: v.subject,
          body: v.body ?? null,
          html: v.html ?? null,
          text: v.text ?? null,
          providerTemplateId: v.providerTemplateId ?? null,
        },
      });

    return json({ ok: true });
  },
);
