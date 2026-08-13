import { z } from "zod";
import { materializeCampaign } from "@realm/notifications";
import { handler, json, problem } from "@realm/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { notificationTables, usersRef } from "@/lib/notifications/tables";
import { resolveSegment } from "@/lib/campaigns/segment";

const schema = z.object({
  /** The count the admin was shown and approved. */
  confirmedCount: z.number().int().nonnegative(),
});

export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> => {
    await requireAdmin();
    const { id } = await ctx.params;
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return problem(400, "Confirm the recipient count before sending");

    const { queued } = await materializeCampaign(
      { db, tables: notificationTables, users: usersRef, resolveSegment },
      id,
    );

    // A send is irreversible. If the audience moved between the admin approving
    // a number and this call, say so rather than quietly mailing a different set.
    if (queued !== parsed.data.confirmedCount) {
      return json({
        queued,
        warning: `Audience changed: approved ${parsed.data.confirmedCount}, queued ${queued}`,
      });
    }
    return json({ queued });
  },
);
