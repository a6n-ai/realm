import { and, desc, eq, lt } from "drizzle-orm";
import { handler, json, problem } from "@foundry/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { campaign, notificationOutbox, users } from "@/db/schema";

const PAGE_SIZE = 20;

export const GET = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> => {
    await requireAdmin();
    const { id } = await ctx.params;

    const [c] = await db.select({ id: campaign.id }).from(campaign).where(eq(campaign.publicId, id));
    if (!c) return problem(404, "Campaign not found");

    const url = new URL(req.url);
    const cursorParam = url.searchParams.get("cursor");
    const cursor = cursorParam && /^\d+$/.test(cursorParam) ? Number(cursorParam) : undefined;

    const rows = await db
      .select({
        publicId: notificationOutbox.publicId,
        channel: notificationOutbox.channel,
        status: notificationOutbox.status,
        attempts: notificationOutbox.attempts,
        providerMessageId: notificationOutbox.providerMessageId,
        lastError: notificationOutbox.lastError,
        createdAt: notificationOutbox.createdAt,
        email: users.email,
        recipientEmail: notificationOutbox.recipientEmail,
      })
      .from(notificationOutbox)
      .leftJoin(users, eq(users.id, notificationOutbox.recipientId))
      .where(
        cursor
          ? and(eq(notificationOutbox.campaignId, BigInt(c.id)), lt(notificationOutbox.createdAt, cursor))
          : eq(notificationOutbox.campaignId, BigInt(c.id)),
      )
      .orderBy(desc(notificationOutbox.createdAt))
      .limit(PAGE_SIZE);

    return json({ rows, nextCursor: rows.length === PAGE_SIZE ? rows[rows.length - 1].createdAt : null });
  },
);
